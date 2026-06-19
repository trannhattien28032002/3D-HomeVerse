/**
 * Zustand store quản lý UI state của editor (panel/tool/viewport/snap).
 *
 * State chính:
 *   isDecorCatalogOpen  — drawer danh mục đồ vật mở/đóng
 *   activeTool2D        — tool đang active trong chế độ 2D ("select"|"draw"|"placing")
 *   placementModelId    — modelId đang chờ đặt xuống sàn (null nếu không placing)
 *   viewportWidth/Height — kích thước viewport, sync từ window.resize
 *   isMaterialSidebarOpen — Material Sidebar mở/đóng; selection store đóng panel này
 *     khi selection về null (gọi chéo một chiều, xem useSelectionStore).
 *
 * Selection model (selected / selectedWallIds / selectedFurnitureIds) đã tách sang
 * useSelectionStore (4.1).
 */
import { create } from "zustand";
import type { ToolId, WallToolId } from "src/app/components/editor/tools/toolRegistry";
import { SNAP_M, SNAP_OPTIONS, setSnapM } from "src/shared/constants/placement";

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
    isVersionsOpen: boolean;
    openVersions: () => void;
    closeVersions: () => void;
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
    isVersionsOpen: false,
    openVersions: () => set({ isVersionsOpen: true }),
    closeVersions: () => set({ isVersionsOpen: false }),
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