/**
 * Zustand store quản lý toàn bộ UI state của editor.
 *
 * State chính:
 *   isDecorCatalogOpen  — drawer danh mục đồ vật mở/đóng
 *   activeTool2D        — tool đang active trong chế độ 2D ("select"|"draw"|"placing")
 *   placementModelId    — modelId đang chờ đặt xuống sàn (null nếu không placing)
 *   viewportWidth/Height — kích thước viewport, sync từ window.resize
 *
 * Selection (R6 — single owner + multi-select sets):
 *   selected            — nguồn duy nhất cho Material Sidebar (object/wall/room)
 *   selectedWallIds     — multi-select 2D tường (Set<wallId>)
 *   selectedFurnitureId s — multi-select 2D object/furniture (Set<entityId>)
 *   2 set tách với `selected` vì sidebar chỉ cần 1 mục tại một thời điểm nhưng 2D cho
 *   phép chọn nhiều để kéo/xóa hàng loạt (vd Ctrl+A).
 *
 *   Bất biến mutual-exclusion: tường ↔ object loại trừ nhau cho thao tác thường —
 *   setSelectedWallIds(non-empty) tự xóa selectedFurnitureIds và ngược lại. Ngoại lệ
 *   duy nhất là selectAll2D (Ctrl+A) set cả hai cùng lúc, bỏ qua cross-clear.
 *
 *   Khi một set có size === 1 → `selected` tự sync sang {kind} tương ứng để feed sidebar;
 *   size 0/>1 → sidebar không hiển thị (selected = null/giữ nguyên).
 *   Derived helper selectedRoomKey = selected.kind === "room" ? selected.id : null,
 *   tính inline tại nơi dùng.
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
    isChatbotOpen: boolean;
    openChatbot: () => void;
    closeChatbot: () => void;
    toggleChatbot: () => void;
    isSaveLoadOpen: boolean;
    openSaveLoad: () => void;
    closeSaveLoad: () => void;
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
    /**
     * Tập object/furniture đang chọn trong Plan 2D (multi-select). Mutual-exclusive với
     * selectedWallIds (xem doc đầu file). size === 1 → sync `selected` sang {kind:"object"}.
     */
    selectedFurnitureIds: Set<string>;
    setSelectedFurnitureIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    /** Ctrl+A — chọn đồng thời mọi tường + mọi object (bỏ qua mutual-exclusion). */
    selectAll2D: (wallIds: Set<string>, furnitureIds: Set<string>) => void;
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
    isChatbotOpen: false,
    openChatbot: () => set({ isChatbotOpen: true }),
    closeChatbot: () => set({ isChatbotOpen: false }),
    toggleChatbot: () => set((s) => ({ isChatbotOpen: !s.isChatbotOpen })),
    isSaveLoadOpen: false,
    openSaveLoad: () => set({ isSaveLoadOpen: true }),
    closeSaveLoad: () => set({ isSaveLoadOpen: false }),
    selected: null,
    // Đổi selection → đóng sidebar nếu bỏ chọn (null) để không treo panel mồ côi.
    // Đồng thời reconcile 2 set multi-select 2D để chúng không lệch với single-owner
    // `selected` (vd 3D chọn object → set selectedFurnitureIds tương ứng cho 2D highlight).
    setSelected: (target) => set((s) => ({
        selected: target,
        selectedWallIds:      target?.kind === "wall"   ? new Set([target.id]) : new Set<string>(),
        selectedFurnitureIds: target?.kind === "object" ? new Set([target.id]) : new Set<string>(),
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
                : (s.selected?.kind === "object" ? null : s.selected);
        return {
            selectedWallIds: next,
            // Mutual-exclusion: chọn tường → bỏ chọn object (Ctrl+A đi qua selectAll2D nên không bị).
            selectedFurnitureIds: next.size > 0 ? new Set<string>() : s.selectedFurnitureIds,
            selected: newSelected,
            isMaterialSidebarOpen: newSelected === null ? false : s.isMaterialSidebarOpen,
        };
    }),
    selectedFurnitureIds: new Set<string>(),
    setSelectedFurnitureIds: (idsOrFn) => set((s) => {
        const next = typeof idsOrFn === "function" ? idsOrFn(s.selectedFurnitureIds) : idsOrFn;
        // Đối xứng với setSelectedWallIds: 1 object → feed sidebar; 0/>1 → không.
        const newSelected = next.size === 1
            ? { kind: "object" as const, id: [...next][0] }
            : next.size === 0
                ? (s.selected?.kind === "object" ? null : s.selected)
                : (s.selected?.kind === "wall" ? null : s.selected);
        return {
            selectedFurnitureIds: next,
            // Mutual-exclusion: chọn object → bỏ chọn tường.
            selectedWallIds: next.size > 0 ? new Set<string>() : s.selectedWallIds,
            selected: newSelected,
            isMaterialSidebarOpen: newSelected === null ? false : s.isMaterialSidebarOpen,
        };
    }),
    selectAll2D: (wallIds, furnitureIds) => set({
        selectedWallIds: wallIds,
        selectedFurnitureIds: furnitureIds,
        // Multi cả 2 loại → không có single target cho sidebar; đóng panel.
        selected: null,
        isMaterialSidebarOpen: false,
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