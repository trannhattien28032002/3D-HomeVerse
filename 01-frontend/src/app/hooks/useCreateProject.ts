/**
 * useCreateProject — data-access cho CreateProjectModal (4.3).
 *
 * Bọc luồng tạo project + upload thumbnail để modal không import `data/` trực tiếp.
 * Trả về một hàm submit; modal vẫn tự quản status/error/navigate (UI state).
 *
 * Luồng giữ nguyên:
 *   1. POST /projects → nếu lỗi trả { ok:false, message }.
 *   2. Có file → upload Supabase Storage rồi PATCH thumbnailUrl; lỗi bước này
 *      KHÔNG chặn (project đã tồn tại), chỉ console.warn.
 *   3. Trả { ok:true, project }.
 */
import { useCallback } from "react";
import { createProject, updateProject } from "src/data/projects/projectsApi";
import { uploadThumbnail } from "src/data/projects/uploadThumbnail";
import type { ProjectMeta } from "src/data/projects/types";
import { apiErrorMessage } from "src/data/api/client";
import { useAuthStore } from "src/app/store/useAuthStore";

export type { ProjectMeta };

export type CreateProjectResult =
    | { ok: true; project: ProjectMeta }
    | { ok: false; message: string };

export function useCreateProject() {
    return useCallback(async (name: string, file: File | null): Promise<CreateProjectResult> => {
        let project: ProjectMeta;
        try {
            project = await createProject({ name, floorCount: 1 });
        } catch (err) {
            return { ok: false, message: apiErrorMessage(err, "Không thể tạo project. Vui lòng thử lại.") };
        }

        if (file) {
            try {
                const userId = useAuthStore.getState().user!.id;
                const thumbnailUrl = await uploadThumbnail(file, project.id, userId);
                project = await updateProject(project.id, { thumbnailUrl });
            } catch (err) {
                // Upload/PATCH thumbnail lỗi không chặn — project đã tồn tại.
                console.warn("Upload thumbnail thất bại, bỏ qua và tiếp tục vào editor:", err);
            }
        }

        return { ok: true, project };
    }, []);
}
