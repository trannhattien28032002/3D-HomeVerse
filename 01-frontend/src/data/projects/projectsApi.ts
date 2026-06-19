/**
 * Module gọi backend Projects API qua apiFetch (đã tự gắn Authorization: Bearer).
 */
import { apiFetch } from "src/data/api/client";
import type { ProjectMeta } from "src/data/projects/types";

export interface ListProjectsParams {
    limit?: number;
    sort?: string;
    cursor?: string;
}

export interface ListProjectsResult {
    data: ProjectMeta[];
    nextCursor: string | null;
}

export interface CreateProjectBody {
    name?: string;
    floorCount?: number;
}

export interface UpdateProjectBody {
    thumbnailUrl?: string;
    name?: string;
    isTemplate?: boolean;
    isPublic?: boolean;
}

/** POST /projects/:id/duplicate trả về (RETURNING id, name). */
export interface DuplicateResult {
    id: string;
    name: string;
}

/** GET /projects?limit&sort&cursor — danh sách project của user hiện tại. */
export async function listProjects(params?: ListProjectsParams): Promise<ListProjectsResult> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.sort !== undefined) query.set("sort", params.sort);
    if (params?.cursor !== undefined) query.set("cursor", params.cursor);

    const qs = query.toString();
    return apiFetch<ListProjectsResult>(`/projects${qs ? `?${qs}` : ""}`);
}

/** POST /projects — tạo project mới (floorCount mặc định 1 nếu không truyền). */
export async function createProject(body: CreateProjectBody): Promise<ProjectMeta> {
    return apiFetch<ProjectMeta>("/projects", { method: "POST", body });
}

/** GET /projects/:id — metadata 1 project. */
export async function getProject(id: string): Promise<ProjectMeta> {
    return apiFetch<ProjectMeta>(`/projects/${id}`);
}

/** PATCH /projects/:id — cập nhật metadata project (vd: thumbnailUrl sau khi upload). */
export async function updateProject(id: string, body: UpdateProjectBody): Promise<ProjectMeta> {
    return apiFetch<ProjectMeta>(`/projects/${id}`, { method: "PATCH", body });
}

/** DELETE /projects/:id — xoá mềm (soft-delete). Backend trả 204. */
export async function deleteProject(id: string): Promise<void> {
    await apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
}

/** POST /projects/:id/duplicate — nhân bản (kèm scene_data). Trả về { id, name }. */
export async function duplicateProject(id: string): Promise<DuplicateResult> {
    return apiFetch<DuplicateResult>(`/projects/${id}/duplicate`, { method: "POST" });
}
