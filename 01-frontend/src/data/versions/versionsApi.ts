/**
 * versionsApi — gọi backend project versions (P4).
 *
 * Hợp đồng backend (đã có):
 *   GET  /projects/:id/versions            → { data: VersionSummary[] }  (mới nhất trước, KHÔNG kèm scene_data)
 *   POST /projects/:id/versions            body { label? } → 201 VersionSummary  (snapshot projects.scene_data hiện tại)
 *   GET  /projects/:id/versions/:vid       → Version  (kèm scene_data)
 *   POST /projects/:id/versions/:vid/restore → { restoredAt }  (ghi scene_data của version về project)
 *
 * Lưu ý luồng:
 *   - createVersion chụp scene ĐÃ LƯU trên server (không phải engine sống) → phải saveScene trước.
 *   - restoreVersion chỉ ghi server-side, KHÔNG trả scene → caller phải nạp lại scene vào engine.
 */
import { apiFetch } from "src/data/api/client";
import type { SceneDocument } from "src/shared/types/SceneDocument";

/** Tóm tắt version (không kèm scene_data) — dùng cho list. */
export interface VersionSummary {
    id: string;
    projectId: string;
    versionNum: number;
    label: string | null;
    createdBy: string | null;
    createdAt: string;
}

/** Version đầy đủ kèm snapshot scene_data. */
export interface Version extends VersionSummary {
    sceneData: SceneDocument;
}

/** GET /projects/:id/versions — danh sách version (mới nhất trước). */
export async function listVersions(projectId: string): Promise<VersionSummary[]> {
    const res = await apiFetch<{ data: VersionSummary[] }>(`/projects/${projectId}/versions`);
    return res.data;
}

/** POST /projects/:id/versions — tạo snapshot từ scene đã lưu (label optional, max 200). */
export async function createVersion(projectId: string, label?: string): Promise<VersionSummary> {
    return apiFetch<VersionSummary>(`/projects/${projectId}/versions`, {
        method: "POST",
        body: { label },
    });
}

/** GET /projects/:id/versions/:vid — version kèm scene_data đầy đủ. */
export async function getVersion(projectId: string, versionId: string): Promise<Version> {
    return apiFetch<Version>(`/projects/${projectId}/versions/${versionId}`);
}

/** POST /projects/:id/versions/:vid/restore — ghi scene của version về project. */
export async function restoreVersion(
    projectId: string,
    versionId: string,
): Promise<{ restoredAt: string }> {
    return apiFetch<{ restoredAt: string }>(`/projects/${projectId}/versions/${versionId}/restore`, {
        method: "POST",
    });
}
