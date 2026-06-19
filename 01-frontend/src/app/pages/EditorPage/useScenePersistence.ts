/**
 * useScenePersistence — nối editor ↔ backend scene (P1).
 *
 * Trách nhiệm:
 *   1. Load: khi engine sẵn sàng → GET /projects/:id/scene → deserialize vào engine.
 *      - Project mới (scene_data = {}) → giữ scene khởi tạo, đặt baseline = hiện tại.
 *      - Scene CÓ dữ liệu nhưng hỏng → status "error" + KHÔNG bật autosave (tránh ghi đè rỗng).
 *   2. Lưu tay (Ctrl+S → saveNow): PUT /scene, cập nhật baseline, toast + saveState.
 *   3. Autosave: uỷ cho useAutosave (debounce 5s + interval 60s), chia sẻ baselineRef.
 *
 * baselineRef (JSON bản đã-lưu gần nhất) được dùng chung để lưu-tay và autosave
 * không ghi trùng nhau.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import { serializeScene, deserializeScene, validateSceneDocument, validationFailed } from "src/engine/serialization";
import type { SceneDocument } from "src/engine/serialization";
import { loadScene, saveScene } from "src/data/scene/scenesApi";
import { toast } from "src/app/store/useToastStore";
import { useAutosave } from "./useAutosave";

export type SceneStatus = "loading" | "ready" | "error";
export type SaveState = "idle" | "saving" | "saved" | "error";

/** scene_data rỗng (project mới) = null hoặc object không có key. */
function isEmptyScene(doc: unknown): boolean {
    return (
        doc == null ||
        (typeof doc === "object" && !Array.isArray(doc) && Object.keys(doc as object).length === 0)
    );
}

export type ScenePersistence = {
    status: SceneStatus;
    /** Tiến độ nạp scene 0–1 (số item GLB đã spawn / tổng). 1 khi không có item nào cần tải. */
    loadProgress: number;
    saveState: SaveState;
    /** Lưu tay scene hiện tại. silent=true: bỏ toast thành công (vd lưu ngầm trước khi tạo version). Trả true nếu lưu thành công. */
    saveNow: (opts?: { silent?: boolean }) => Promise<boolean>;
    /** Nạp một SceneDocument vào engine (thay thế scene hiện tại) + cập nhật baseline (dùng cho restore version). */
    applyScene: (doc: SceneDocument) => Promise<void>;
};

export function useScenePersistence(
    projectId: string | undefined,
    engineRef: RefObject<EngineInstance | null>,
    engineReady: boolean,
): ScenePersistence {
    const [status, setStatus] = useState<SceneStatus>("loading");
    const [loadProgress, setLoadProgress] = useState(0);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const baselineRef = useRef<string | null>(null);
    // Khoá theo projectId để StrictMode/re-render không load (và deserialize) hai lần.
    const loadedProjectRef = useRef<string | null>(null);

    useEffect(() => {
        if (!engineReady || !projectId) return;
        if (loadedProjectRef.current === projectId) return;
        loadedProjectRef.current = projectId;

        let cancelled = false;
        let done = false; // true khi load đã xong (ready) — chặn reset guard lúc cleanup.
        void (async () => {
            try {
                setStatus("loading");
                const doc = await loadScene(projectId);
                if (cancelled) return;
                const engine = engineRef.current;
                if (!engine) { setStatus("error"); return; }

                if (isEmptyScene(doc)) {
                    // Project mới → baseline = scene khởi tạo hiện tại; autosave chỉ chạy khi user đổi.
                    baselineRef.current = JSON.stringify(serializeScene(engine));
                    setLoadProgress(1); // không có item nào để tải
                    done = true;
                    setStatus("ready");
                    return;
                }

                const v = validateSceneDocument(doc);
                if (validationFailed(v)) {
                    console.error("[scenePersistence] invalid scene:", v.error);
                    toast.error("Bản thiết kế trên máy chủ bị lỗi — chưa bật tự lưu để tránh ghi đè.");
                    setStatus("error");
                    return;
                }

                await deserializeScene(doc as SceneDocument, engine, (n, t) => {
                    if (!cancelled) setLoadProgress(t === 0 ? 1 : n / t);
                });
                if (cancelled) return;
                setLoadProgress(1);
                baselineRef.current = JSON.stringify(doc);
                done = true;
                setStatus("ready");
            } catch (e) {
                if (cancelled) return;
                console.error("[scenePersistence] load failed:", e);
                toast.error("Không tải được bản thiết kế từ máy chủ.");
                setStatus("error");
            }
        })();

        // Cleanup: nếu load chưa hoàn tất (StrictMode mount/cleanup/mount, hoặc lỗi),
        // mở khoá guard để lần mount sau load lại — tránh kẹt mãi ở "loading".
        return () => {
            cancelled = true;
            if (!done) loadedProjectRef.current = null;
        };
    }, [engineReady, projectId, engineRef]);

    const saveNow = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
        const engine = engineRef.current;
        if (!engine || !projectId) return false;
        const doc = serializeScene(engine);
        const json = JSON.stringify(doc);
        setSaveState("saving");
        try {
            await saveScene(projectId, doc);
            baselineRef.current = json;
            setSaveState("saved");
            if (!opts?.silent) toast.success("Đã lưu bản thiết kế.");
            setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
            return true;
        } catch (e) {
            console.error("[scenePersistence] save failed:", e);
            setSaveState("error");
            toast.error("Lưu thất bại. Vui lòng thử lại.");
            return false;
        }
    }, [projectId, engineRef]);

    /**
     * Nạp một SceneDocument vào engine, thay thế scene hiện tại (deserializeScene tự xoá
     * scene cũ trước). Cập nhật baseline = doc để autosave không lập tức ghi lại. Dùng cho
     * restore version: caller đã POST restore (ghi server), rồi gọi applyScene để đồng bộ engine.
     */
    const applyScene = useCallback(async (doc: SceneDocument): Promise<void> => {
        const engine = engineRef.current;
        if (!engine) return;
        await deserializeScene(doc, engine);
        baselineRef.current = JSON.stringify(doc);
    }, [engineRef]);

    const onAutosaveError = useCallback((e: unknown) => {
        console.warn("[scenePersistence] autosave failed:", e);
    }, []);

    useAutosave({
        projectId,
        engineRef,
        enabled: status === "ready",
        baselineRef,
        onError: onAutosaveError,
    });

    return { status, loadProgress, saveState, saveNow, applyScene };
}
