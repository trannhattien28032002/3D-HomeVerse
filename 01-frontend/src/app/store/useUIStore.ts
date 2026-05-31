/**
 * useUIStore — Zustand store cho UI state toàn cục (không liên quan đến ECS).
 *
 * Lưu:
 *   - isSidebarOpen: trạng thái sidebar (hiện chưa dùng)
 *   - viewportWidth/Height: kích thước window — PlanView2D dùng để tính offset origin
 *   - getAndIncrementNextWallId(): counter wallId cho UI (độc lập với maxWallIdRef engine)
 *
 * Tại sao cần syncViewport:
 *   PlanView2D cần biết viewport size để tính origin offset (ox = vpW/2, oy = vpH/2).
 *   useUIStore tập trung hóa resize logic — chỉ 1 listener window.resize trong EditorPage.
 *
 * getAndIncrementNextWallId: closure private trong store — không expose raw counter.
 *   Tránh race condition khi nhiều dispatch xảy ra trong cùng transaction.
 */
import { create } from "zustand";

/** Phải đồng bộ với số DEFAULT_WALLS trong engine.ts + 1. */
const INITIAL_NEXT_WALL_ID = 4;

type UIState = {
    // ── Sidebar ────────────────────────────────────────────────
    isSidebarOpen: boolean;
    openSidebar: () => void;
    closeSidebar: () => void;
    toggleSidebar: () => void;

    // ── Viewport ───────────────────────────────────────────────
    /** Kích thước cửa sổ hiện tại (px). Sync với window.resize. */
    viewportWidth: number;
    viewportHeight: number;
    /**
     * Cập nhật viewport. Gọi khi cửa sổ resize.
     * Chỉ set nếu thực sự thay đổi để tránh re-render thừa.
     */
    syncViewport: (width: number, height: number) => void;

    // ── Wall ID counter ────────────────────────────────────────
    /**
     * Lấy và tăng wallId tiếp theo.
     * Dùng khi dispatch ADD_WALL để tránh race condition với snapshot async.
     */
    getAndIncrementNextWallId: () => number;
};

export const useUIStore = create<UIState>((set, get) => ({
    // ── Sidebar
    isSidebarOpen: false,
    openSidebar: () => set({ isSidebarOpen: true }),
    closeSidebar: () => set({ isSidebarOpen: false }),
    toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

    // ── Viewport
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 720,

    syncViewport: (width, height) => {
        const { viewportWidth, viewportHeight } = get();
        if (viewportWidth === width && viewportHeight === height) return;
        set({ viewportWidth: width, viewportHeight: height });
    },

    // ── Wall ID counter (private detail, không cần expose raw)
    // Lưu trong closure để không ai set trực tiếp ngoài action
    getAndIncrementNextWallId: (() => {
        let _nextId = INITIAL_NEXT_WALL_ID;
        return () => _nextId++;
    })(),
}));