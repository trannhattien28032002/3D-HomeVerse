/**
 * scenesApi — gọi backend scenes + autosave (P1).
 *
 * Hợp đồng backend (đã có):
 *   GET  /projects/:id/scene          → { sceneData }   (blob JSONB; {} nếu project mới)
 *   PUT  /projects/:id/scene          body { sceneData } (validate sceneData.version: number)
 *   POST /projects/:id/autosave       body { sceneData } → 201 (insert + prune keep-last-5)
 *   GET  /projects/:id/autosave/latest → { sceneData } | null
 *
 * sceneData map thẳng từ serializeScene(engine) (SceneDocument). API KHÔNG rewrite
 * slug catalog bên trong blob.
 */
import { apiFetch } from "src/data/api/client";
import type { SceneDocument } from "src/shared/types/SceneDocument";

/**
 * Tải scene của project. Trả về raw blob (có thể là {} với project mới, hoặc null).
 * Caller tự validate trước khi deserialize.
 */
export async function loadScene(projectId: string): Promise<unknown> {
    const res = await apiFetch<{ sceneData: unknown }>(`/projects/${projectId}/scene`);
    return res?.sceneData ?? null;
}

/** Lưu toàn bộ scene (PUT, atomic). */
export async function saveScene(projectId: string, sceneData: SceneDocument): Promise<void> {
    await apiFetch(`/projects/${projectId}/scene`, {
        method: "PUT",
        body: { sceneData },
    });
}

/** Tạo 1 bản autosave (POST). Backend tự prune giữ 5 bản gần nhất. */
export async function createAutosave(projectId: string, sceneData: SceneDocument): Promise<void> {
    await apiFetch(`/projects/${projectId}/autosave`, {
        method: "POST",
        body: { sceneData },
    });
}

/** Lấy bản autosave mới nhất (hoặc null nếu chưa có). */
export async function getLatestAutosave(projectId: string): Promise<unknown> {
    const res = await apiFetch<{ sceneData: unknown } | null>(`/projects/${projectId}/autosave/latest`);
    return res?.sceneData ?? null;
}
