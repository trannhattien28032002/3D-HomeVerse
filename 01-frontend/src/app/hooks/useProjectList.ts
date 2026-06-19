/**
 * useProjectList — data-access cho ProjectsPage (4.3).
 *
 * Gom toàn bộ gọi backend (list + pagination + rename/duplicate/delete) cùng
 * toast lỗi vào một hook để ProjectsPage chỉ còn render + UI state (search,
 * modal target). Đây là convention: component KHÔNG import `data/` trực tiếp,
 * mọi fetch đi qua `use*`.
 *
 * Hành vi giữ nguyên y hệt bản inline cũ trong ProjectsPage:
 *   - load lần đầu (effect mount), có cancel-guard chống setState sau unmount.
 *   - loadState: loading → ready/empty/error.
 *   - rename/delete trả Promise<boolean> để caller tự đóng modal khi thành công
 *     (giữ modal-target là UI state trong component).
 */
import { useEffect, useState } from "react";
import {
    listProjects,
    getProject,
    deleteProject,
    duplicateProject,
    updateProject,
} from "src/data/projects/projectsApi";
import type { ProjectMeta } from "src/data/projects/types";
import { apiErrorMessage } from "src/data/api/client";
import { toast } from "src/app/store/useToastStore";

export type { ProjectMeta };

export type LoadState = "loading" | "empty" | "error" | "ready";

const PAGE_SIZE = 12;

export function useProjectList() {
    const [projects, setProjects] = useState<ProjectMeta[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoadState("loading");
            setLoadError(null);
            try {
                const result = await listProjects({ limit: PAGE_SIZE });
                if (cancelled) return;
                setProjects(result.data);
                setNextCursor(result.nextCursor);
                setLoadState(result.data.length === 0 ? "empty" : "ready");
            } catch (err) {
                if (cancelled) return;
                const message = apiErrorMessage(err, "Không thể tải danh sách project.");
                setLoadError(message);
                setLoadState("error");
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    /** Project vừa tạo từ modal → chèn đầu danh sách. */
    const addCreated = (project: ProjectMeta) => {
        setProjects((prev) => [project, ...prev]);
        setLoadState("ready");
    };

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await listProjects({ limit: PAGE_SIZE, cursor: nextCursor });
            setProjects((prev) => [...prev, ...result.data]);
            setNextCursor(result.nextCursor);
        } catch (err) {
            const message = apiErrorMessage(err, "Không thể tải thêm project.");
            toast.error(message);
        } finally {
            setLoadingMore(false);
        }
    };

    /** Trả true nếu đổi tên thành công (caller đóng modal khi true). */
    const renameProject = async (id: string, name: string): Promise<boolean> => {
        setActionBusy(true);
        try {
            const updated = await updateProject(id, { name });
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            toast.success("Đã đổi tên project.");
            return true;
        } catch (err) {
            const message = apiErrorMessage(err, "Đổi tên thất bại.");
            toast.error(message);
            return false;
        } finally {
            setActionBusy(false);
        }
    };

    const duplicate = async (project: ProjectMeta) => {
        try {
            const { id } = await duplicateProject(project.id);
            const full = await getProject(id);
            setProjects((prev) => [full, ...prev]);
            setLoadState("ready");
            toast.success("Đã nhân bản project.");
        } catch (err) {
            const message = apiErrorMessage(err, "Nhân bản thất bại.");
            toast.error(message);
        }
    };

    /** Trả true nếu xoá thành công (caller đóng confirm khi true). */
    const removeProject = async (id: string): Promise<boolean> => {
        setActionBusy(true);
        try {
            await deleteProject(id);
            setProjects((prev) => {
                const next = prev.filter((p) => p.id !== id);
                if (next.length === 0) setLoadState("empty");
                return next;
            });
            toast.success("Đã xoá project.");
            return true;
        } catch (err) {
            const message = apiErrorMessage(err, "Xoá thất bại.");
            toast.error(message);
            return false;
        } finally {
            setActionBusy(false);
        }
    };

    return {
        projects,
        loadState,
        loadError,
        nextCursor,
        loadingMore,
        actionBusy,
        addCreated,
        loadMore,
        renameProject,
        duplicate,
        removeProject,
    };
}
