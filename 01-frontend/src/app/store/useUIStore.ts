/**
 * Zustand store quản lý toàn bộ UI state của editor.
 *
 * State chính:
 *   isDecorCatalogOpen  — drawer danh mục đồ vật mở/đóng
 *   activeTool2D        — tool đang active trong chế độ 2D ("select"|"draw"|"placing")
 *   placementModelId    — modelId đang chờ đặt xuống sàn (null nếu không placing)
 *   viewportWidth/Height — kích thước viewport, sync từ window.resize
 *
 * Selection (R6 — single owner):
 *   selected       — nguồn duy nhất cho Material Sidebar (object/wall/room)
 *   selectedWallIds — multi-select 2D tường (Set<wallId>); tách với `selected` vì
 *                    sidebar chỉ cần 1 tường tại một thời điểm nhưng 2D cho phép
 *                    chọn nhiều để kéo/xóa hàng loạt.
 *   Derived helpers:
 *     selectedFurnitureId — selected.kind === "object" ? selected.id : null
 *     selectedRoomKey     — selected.kind === "room"   ? selected.id : null
 *   Các derived helper này được tính inline tại nơi dùng để không duplicate state.
 */
import { create } from "zustand";
import type { ToolId, WallToolId } from "src/app/components/editor/tools/toolRegistry";
import { SNAP_M, SNAP_OPTIONS, setSnapM } from "src/shared/constants/placement";

/**
 * Mục tiêu đang được chọn (dùng chung 2D & 3D) — nguồn cho Material Sidebar.
 *   - object: id = ECS entityId (furniture / wall-item GLB)
 *   - wall:   id = wallId
 *   - room:   id = roomKey (sorted nodeIds)
 */
export type SelectedTarget =
    | { kind: "object"; id: string }
    | { kind: "wall"; id: string }
    | { kind: "room"; id: string };

type UIState = {
    isDecorCatalogOpen: boolean;
    openDecorCatalog: () => void;
    closeDecorCatalog: () => void;
    toggleDecorCatalog: () => void;
    /** Mục tiêu đang được chọn (object/wall/room) — nguồn duy nhất cho Material Sidebar (R6). */
    selected: SelectedTarget | null;
    setSelected: (target: SelectedTarget | null) => void;
    /**
     * Tập hợp tường đang được chọn trong Plan 2D (multi-select) — R6 owner duy nhất.
     * Material Sidebar dùng `selected` (1 wall); 2D dùng selectedWallIds cho drag/delete nhiều.
     * Khi selectedWallIds.size === 1 → `selected` tự động sync sang {kind:"wall"}.
     */
    selectedWallIds: Set<string>;
    setSelectedWallIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    /** Material Sidebar (panel phải) mở/đóng. */
    isMaterialSidebarOpen: boolean;
    openMaterialSidebar: () => void;
    closeMaterialSidebar: () => void;
    activeTool2D: ToolId;
    setTool2D: (mode: WallToolId) => void;
    placementModelId: string | null;
    beginPlacement2D: (modelId: string) => void;
    endPlacement2D: () => void;
    /** modelId đang chờ đặt lên tường ở chế độ 2D (null nếu không active). */
    wallPlacementModelId: string | null;
    beginWallPlacement2D: (modelId: string) => void;
    endWallPlacement2D: () => void;
    viewportWidth: number;
    viewportHeight: number;
    syncViewport: (width: number, height: number) => void;
    /** Bước lưới snap hiện hành (mét) — đồng bộ với engine qua setSnapM. */
    snapM: number;
    /** Luân phiên bước lưới snap qua các giá trị trong SNAP_OPTIONS. */
    cycleSnap: () => void;
};

export const useUIStore = create<UIState>((set, get) => ({
    isDecorCatalogOpen: false,
    openDecorCatalog: () => set({ isDecorCatalogOpen: true }),
    closeDecorCatalog: () => set({ isDecorCatalogOpen: false }),
    toggleDecorCatalog: () => set((s) => ({ isDecorCatalogOpen: !s.isDecorCatalogOpen })),
    selected: null,
    // Đổi selection → đóng sidebar nếu bỏ chọn (null) để không treo panel mồ côi.
    setSelected: (target) => set((s) => ({
        selected: target,
        isMaterialSidebarOpen: target === null ? false : s.isMaterialSidebarOpen,
    })),
    selectedWallIds: new Set<string>(),
    setSelectedWallIds: (idsOrFn) => set((s) => {
        const next = typeof idsOrFn === "function" ? idsOrFn(s.selectedWallIds) : idsOrFn;
        // Auto-sync `selected` từ wall selection (R6): 1 tường → feed sidebar; 0/>1 → không.
        const newSelected = next.size === 1
            ? { kind: "wall" as const, id: [...next][0] }
            : next.size === 0
                ? (s.selected?.kind === "wall" ? null : s.selected)
                : s.selected;
        return {
            selectedWallIds: next,
            selected: newSelected,
            isMaterialSidebarOpen: newSelected === null ? false : s.isMaterialSidebarOpen,
        };
    }),
    isMaterialSidebarOpen: false,
    openMaterialSidebar: () => set({ isMaterialSidebarOpen: true }),
    closeMaterialSidebar: () => set({ isMaterialSidebarOpen: false }),
    activeTool2D: "select",
    setTool2D: (mode) => set({ activeTool2D: mode, placementModelId: null, wallPlacementModelId: null }),
    placementModelId: null,
    beginPlacement2D: (modelId) => set({ placementModelId: modelId, activeTool2D: "placing", wallPlacementModelId: null }),
    endPlacement2D: () => set({ placementModelId: null, activeTool2D: "select" }),
    wallPlacementModelId: null,
    beginWallPlacement2D: (modelId) => set({ wallPlacementModelId: modelId, activeTool2D: "placing-wall" as ToolId, placementModelId: null }),
    endWallPlacement2D: () => set({ wallPlacementModelId: null, activeTool2D: "select" }),
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 720,
    syncViewport: (width, height) => {
        const { viewportWidth, viewportHeight } = get();
        if (viewportWidth === width && viewportHeight === height) return;
        set({ viewportWidth: width, viewportHeight: height });
    },
    snapM: SNAP_M,
    cycleSnap: () => {
        const { snapM } = get();
        const i = SNAP_OPTIONS.indexOf(snapM);
        const next = SNAP_OPTIONS[(i + 1) % SNAP_OPTIONS.length];
        setSnapM(next); // đồng bộ engine (non-React, đọc qua snapToGridM)
        set({ snapM: next });
    },
}));