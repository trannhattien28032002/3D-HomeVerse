/**
 * useEditorLoadingProgress — quản lý thanh tiến độ + vòng đời LoadingScreen của EditorPage.
 *
 * Loading flow 2 pha (loader CHỜ scene tải xong hẳn rồi mới tắt):
 *   Pha A (engine boot): crawl giả 0→BOOT_PROGRESS_CEIL trong lúc Three.js khởi tạo,
 *     dừng khi `engineReady` (SceneView3D.onReady fire).
 *   Pha B (tải scene): `loadProgress` 0→1 (useScenePersistence deserialize GLB tuần tự)
 *     map vào [SCENE_PROGRESS_START, 100]. Math.max giữ thanh không bao giờ lùi.
 *   Tắt: khi engineReady && scene settled (ready/error, hoặc không có project) → loaderDone
 *     → LoadingScreen fade-out → showLoader=false. Phủ trọn quá trình tải để đồ không "pop in".
 *
 * Tách từ EditorPage (Phase 5.6). `engineReady` vẫn do EditorPage sở hữu (SceneView3D set,
 * useScenePersistence cần) và truyền vào đây cùng loadProgress/sceneStatus.
 */
import { useEffect, useState } from "react";

/** Pha A (engine boot) crawl tối đa tới % này; phần còn lại dành cho tải scene. */
const BOOT_PROGRESS_CEIL = 40;
/** Pha B (tải scene): map loadProgress 0→1 vào [SCENE_PROGRESS_START, 100]. */
const SCENE_PROGRESS_START = 45;
const SCENE_PROGRESS_SPAN = 100 - SCENE_PROGRESS_START;

type Params = {
    projectId: string | undefined;
    engineReady: boolean;
    loadProgress: number;
    sceneStatus: string;
};

type Result = {
    progress: number;
    loaderDone: boolean;
    showLoader: boolean;
    setShowLoader: (v: boolean) => void;
};

export function useEditorLoadingProgress({ projectId, engineReady, loadProgress, sceneStatus }: Params): Result {
    const [progress, setProgress] = useState(0);
    const [showLoader, setShowLoader] = useState(true);

    // Pha A — engine boot (0 → BOOT_PROGRESS_CEIL). Crawl giả CHỈ khi khởi tạo Three.js.
    useEffect(() => {
        if (engineReady) return;
        const id = setInterval(() => {
            setProgress(p => (p >= BOOT_PROGRESS_CEIL ? p : Math.min(p + Math.random() * 8, BOOT_PROGRESS_CEIL)));
        }, 200);
        return () => clearInterval(id);
    }, [engineReady]);

    // Pha B — tải scene thật (SCENE_PROGRESS_START → 100). Math.max giữ thanh không lùi.
    useEffect(() => {
        if (!engineReady) return;
        setProgress(p => Math.max(p, SCENE_PROGRESS_START + loadProgress * SCENE_PROGRESS_SPAN));
    }, [engineReady, loadProgress]);

    // Loader tắt khi engine xong VÀ scene settled (ready/error), hoặc không có project.
    const sceneSettled = !projectId || sceneStatus === "ready" || sceneStatus === "error";
    const loaderDone = engineReady && sceneSettled;

    useEffect(() => {
        if (loaderDone) setProgress(100);
    }, [loaderDone]);

    return { progress, loaderDone, showLoader, setShowLoader };
}
