import { create } from "zustand";
import type { ToolId, WallToolId } from "src/app/components/editor/tools/toolRegistry";

type UIState = {
    isDecorCatalogOpen: boolean;
    openDecorCatalog: () => void;
    closeDecorCatalog: () => void;
    toggleDecorCatalog: () => void;
    activeTool2D: ToolId;
    setTool2D: (mode: WallToolId) => void;
    placementModelId: string | null;
    beginPlacement2D: (modelId: string) => void;
    endPlacement2D: () => void;
    viewportWidth: number;
    viewportHeight: number;
    syncViewport: (width: number, height: number) => void;
};

export const useUIStore = create<UIState>((set, get) => ({
    isDecorCatalogOpen: false,
    openDecorCatalog: () => set({ isDecorCatalogOpen: true }),
    closeDecorCatalog: () => set({ isDecorCatalogOpen: false }),
    toggleDecorCatalog: () => set((s) => ({ isDecorCatalogOpen: !s.isDecorCatalogOpen })),
    activeTool2D: "select",
    setTool2D: (mode) => set({ activeTool2D: mode, placementModelId: null }),
    placementModelId: null,
    beginPlacement2D: (modelId) => set({ placementModelId: modelId, activeTool2D: "placing" }),
    endPlacement2D: () => set({ placementModelId: null, activeTool2D: "select" }),
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 720,
    syncViewport: (width, height) => {
        const { viewportWidth, viewportHeight } = get();
        if (viewportWidth === width && viewportHeight === height) return;
        set({ viewportWidth: width, viewportHeight: height });
    },
}));