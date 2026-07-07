// @vitest-environment jsdom
/**
 * useProjectList.test — data-access hook cho ProjectsPage. Mock `projectsApi`
 * (network layer) qua `vi.mock`, giữ nguyên `apiErrorMessage`/`toast` thật (thuần,
 * không network) để test đúng hành vi tích hợp của 5 khối try/catch/toast mà báo
 * cáo review nêu tên (load / loadMore / rename / duplicate / remove).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useProjectList } from "src/app/hooks/useProjectList";
import { ApiError } from "src/data/api/client";
import { toast } from "src/app/store/useToastStore";
import type { ProjectMeta } from "src/data/projects/types";
import * as projectsApi from "src/data/projects/projectsApi";

vi.mock("src/data/projects/projectsApi", () => ({
    listProjects: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    updateProject: vi.fn(),
}));

function makeProject(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
    return {
        id: "p1",
        ownerId: "u1",
        name: "Căn hộ A",
        thumbnailUrl: null,
        floorCount: 1,
        isTemplate: false,
        isPublic: false,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

const listProjects = vi.mocked(projectsApi.listProjects);
const getProject = vi.mocked(projectsApi.getProject);
const deleteProject = vi.mocked(projectsApi.deleteProject);
const duplicateProject = vi.mocked(projectsApi.duplicateProject);
const updateProject = vi.mocked(projectsApi.updateProject);

describe("useProjectList", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(toast, "success").mockImplementation(() => 0);
        vi.spyOn(toast, "error").mockImplementation(() => 0);
    });

    describe("load lần đầu (mount effect)", () => {
        it("thành công, có data → projects/nextCursor đúng, loadState='ready'", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: "cursor-2" });

            const { result } = renderHook(() => useProjectList());
            expect(result.current.loadState).toBe("loading");

            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            expect(result.current.projects).toEqual([p1]);
            expect(result.current.nextCursor).toBe("cursor-2");
            expect(result.current.loadError).toBeNull();
            expect(listProjects).toHaveBeenCalledWith({ limit: 7 });
        });

        it("thành công, KHÔNG data → loadState='empty'", async () => {
            listProjects.mockResolvedValueOnce({ data: [], nextCursor: null });

            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("empty"));

            expect(result.current.projects).toEqual([]);
        });

        it("lỗi (ApiError) → loadError set từ message backend, loadState='error', KHÔNG crash", async () => {
            listProjects.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Không thể tải danh sách."));

            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("error"));

            expect(result.current.loadError).toBe("Không thể tải danh sách.");
            expect(result.current.projects).toEqual([]);
        });

        it("lỗi không phải ApiError → fallback message chung, không crash", async () => {
            listProjects.mockRejectedValueOnce(new TypeError("network down"));

            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("error"));

            expect(result.current.loadError).toBe("Không thể tải danh sách project.");
        });

        it("unmount TRƯỚC KHI promise resolve → cancel-guard chặn setState sau unmount (không lỗi)", async () => {
            let resolveFn!: (v: { data: ProjectMeta[]; nextCursor: string | null }) => void;
            listProjects.mockReturnValueOnce(new Promise((resolve) => { resolveFn = resolve; }));

            const { unmount } = renderHook(() => useProjectList());
            unmount();

            // Resolve SAU khi unmount — cancel-guard (biến `cancelled`) phải chặn setState.
            await act(async () => {
                resolveFn({ data: [makeProject()], nextCursor: null });
                await Promise.resolve();
            });
            // Không assertion nào trên `result` (đã unmount) — chỉ cần không throw/warn crash.
        });
    });

    describe("loadMore", () => {
        it("gọi đúng API với cursor hiện tại, NỐI THÊM data, cập nhật nextCursor", async () => {
            const p1 = makeProject({ id: "p1" });
            const p2 = makeProject({ id: "p2" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: "cursor-2" });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            listProjects.mockResolvedValueOnce({ data: [p2], nextCursor: null });
            await act(async () => { await result.current.loadMore(); });

            expect(listProjects).toHaveBeenLastCalledWith({ limit: 7, cursor: "cursor-2" });
            expect(result.current.projects).toEqual([p1, p2]);
            expect(result.current.nextCursor).toBeNull();
            expect(result.current.loadingMore).toBe(false);
        });

        it("no-op khi không còn nextCursor", async () => {
            listProjects.mockResolvedValueOnce({ data: [makeProject()], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            await act(async () => { await result.current.loadMore(); });

            expect(listProjects).toHaveBeenCalledTimes(1); // chỉ lần load ban đầu
        });

        it("lỗi → toast.error, projects KHÔNG đổi, loadingMore reset về false, không crash", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: "cursor-2" });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            listProjects.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Không thể tải thêm."));
            await act(async () => { await result.current.loadMore(); });

            expect(toast.error).toHaveBeenCalledWith("Không thể tải thêm.");
            expect(result.current.projects).toEqual([p1]);
            expect(result.current.loadingMore).toBe(false);
        });
    });

    describe("renameProject", () => {
        it("thành công → cập nhật đúng project trong list, toast.success, trả về true", async () => {
            const p1 = makeProject({ id: "p1", name: "Cũ" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            const renamed = { ...p1, name: "Mới" };
            updateProject.mockResolvedValueOnce(renamed);

            let ok: boolean | undefined;
            await act(async () => { ok = await result.current.renameProject("p1", "Mới"); });

            expect(ok).toBe(true);
            expect(result.current.projects[0].name).toBe("Mới");
            expect(toast.success).toHaveBeenCalledWith("Đã đổi tên project.");
            expect(result.current.actionBusy).toBe(false);
        });

        it("lỗi → toast.error, list KHÔNG đổi, trả về false", async () => {
            const p1 = makeProject({ id: "p1", name: "Cũ" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            updateProject.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Không có quyền."));

            let ok: boolean | undefined;
            await act(async () => { ok = await result.current.renameProject("p1", "Mới"); });

            expect(ok).toBe(false);
            expect(result.current.projects[0].name).toBe("Cũ");
            expect(toast.error).toHaveBeenCalledWith("Không có quyền.");
            expect(result.current.actionBusy).toBe(false);
        });
    });

    describe("duplicate", () => {
        it("thành công → chèn project mới lên ĐẦU danh sách, toast.success", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            duplicateProject.mockResolvedValueOnce({ id: "p2", name: "Căn hộ A (bản sao)" });
            const p2Full = makeProject({ id: "p2", name: "Căn hộ A (bản sao)" });
            getProject.mockResolvedValueOnce(p2Full);

            await act(async () => { await result.current.duplicate(p1); });

            expect(duplicateProject).toHaveBeenCalledWith("p1");
            expect(getProject).toHaveBeenCalledWith("p2");
            expect(result.current.projects).toEqual([p2Full, p1]);
            expect(toast.success).toHaveBeenCalledWith("Đã nhân bản project.");
        });

        it("lỗi → toast.error, list KHÔNG đổi", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            duplicateProject.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Nhân bản lỗi."));

            await act(async () => { await result.current.duplicate(p1); });

            expect(result.current.projects).toEqual([p1]);
            expect(toast.error).toHaveBeenCalledWith("Nhân bản lỗi.");
        });
    });

    describe("removeProject", () => {
        it("thành công, còn project khác → xoá đúng project, loadState vẫn 'ready', trả true", async () => {
            const p1 = makeProject({ id: "p1" });
            const p2 = makeProject({ id: "p2" });
            listProjects.mockResolvedValueOnce({ data: [p1, p2], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            deleteProject.mockResolvedValueOnce(undefined);

            let ok: boolean | undefined;
            await act(async () => { ok = await result.current.removeProject("p1"); });

            expect(ok).toBe(true);
            expect(result.current.projects).toEqual([p2]);
            expect(result.current.loadState).toBe("ready");
            expect(toast.success).toHaveBeenCalledWith("Đã xoá project.");
        });

        it("thành công, xoá hết project cuối cùng → loadState chuyển 'empty'", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            deleteProject.mockResolvedValueOnce(undefined);
            await act(async () => { await result.current.removeProject("p1"); });

            expect(result.current.projects).toEqual([]);
            expect(result.current.loadState).toBe("empty");
        });

        it("lỗi → toast.error, list KHÔNG đổi, trả về false", async () => {
            const p1 = makeProject({ id: "p1" });
            listProjects.mockResolvedValueOnce({ data: [p1], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("ready"));

            deleteProject.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Xoá lỗi."));

            let ok: boolean | undefined;
            await act(async () => { ok = await result.current.removeProject("p1"); });

            expect(ok).toBe(false);
            expect(result.current.projects).toEqual([p1]);
            expect(toast.error).toHaveBeenCalledWith("Xoá lỗi.");
        });
    });

    describe("addCreated", () => {
        it("chèn project mới lên đầu danh sách + loadState='ready'", async () => {
            listProjects.mockResolvedValueOnce({ data: [], nextCursor: null });
            const { result } = renderHook(() => useProjectList());
            await waitFor(() => expect(result.current.loadState).toBe("empty"));

            const created = makeProject({ id: "new-1" });
            act(() => { result.current.addCreated(created); });

            expect(result.current.projects).toEqual([created]);
            expect(result.current.loadState).toBe("ready");
        });
    });
});
