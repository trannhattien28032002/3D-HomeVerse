/**
 * useAutosave — tự động lưu scene lên backend (P1, Q2: debounce 5s + interval 60s).
 *
 * Nguồn chân lý "scene đã đổi" = so JSON serialize hiện tại với `baselineRef`
 * (bản đã-lưu gần nhất). Lý do dùng diff thay vì chỉ nghe event:
 *   - event "snapshot" chỉ phát khi topology/furniture đổi — KHÔNG phát khi đổi material.
 *   - Diff serialize bắt được MỌI thay đổi (kể cả material) vì serializeScene gói cả
 *     materialFaces / furniture.materials / floors.
 *
 * Hai nhịp, cùng đi qua flush() (đã chống ghi thừa bằng diff + cờ flushing):
 *   - Debounce 5s: kích bởi "snapshot" → lưu nhanh sau khi user ngừng chỉnh topology/đồ.
 *   - Interval 60s: catch-all → bắt cả thay đổi material và chặn debounce trôi quá lâu.
 *
 * baselineRef được chia sẻ với useScenePersistence: cả lưu tay (Ctrl+S) lẫn autosave
 * đều cập nhật nó nên không lưu trùng. 429 (autosaveLimiter) → bỏ qua lần này, nhịp sau thử lại.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import { serializeScene } from "src/engine/serialization";
import { createAutosave } from "src/data/scene/scenesApi";
import { ApiError } from "src/data/api/client";

const DEBOUNCE_MS = 5000;
const INTERVAL_MS = 60000;

type Args = {
    projectId: string | undefined;
    engineRef: RefObject<EngineInstance | null>;
    /** Chỉ bật sau khi load scene xong (tránh autosave đè khi chưa tải được). */
    enabled: boolean;
    /** JSON của bản đã-lưu gần nhất; chia sẻ với useScenePersistence. */
    baselineRef: MutableRefObject<string | null>;
    onError?: (e: unknown) => void;
};

export function useAutosave({ projectId, engineRef, enabled, baselineRef, onError }: Args): void {
    const flushingRef = useRef(false);

    useEffect(() => {
        const engine = engineRef.current;
        if (!enabled || !projectId || !engine) return;

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let disposed = false;

        const flush = async () => {
            if (disposed || flushingRef.current) return;
            const eng = engineRef.current;
            if (!eng) return;
            const doc = serializeScene(eng);
            const json = JSON.stringify(doc);
            if (json === baselineRef.current) return; // không có gì đổi kể từ lần lưu trước
            flushingRef.current = true;
            try {
                await createAutosave(projectId, doc);
                if (!disposed) baselineRef.current = json;
            } catch (e) {
                // 429 từ autosaveLimiter → im lặng, nhịp sau thử lại.
                if (!(e instanceof ApiError && e.status === 429)) onError?.(e);
            } finally {
                flushingRef.current = false;
            }
        };

        // Debounce theo "snapshot" (topology/furniture đổi).
        const offSnapshot = engine.api.events.on("snapshot", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
        });

        // Interval catch-all (bắt cả thay đổi material — không phát "snapshot").
        const interval = setInterval(() => { void flush(); }, INTERVAL_MS);

        return () => {
            disposed = true;
            offSnapshot();
            if (debounceTimer) clearTimeout(debounceTimer);
            clearInterval(interval);
        };
    }, [enabled, projectId, engineRef, baselineRef, onError]);
}
