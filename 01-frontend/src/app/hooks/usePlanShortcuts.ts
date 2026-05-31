import { useEffect, useRef } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { Wall2D } from "src/app/store/useFloorPlanSnapshot";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { ToolId, WallToolId } from "src/app/components/editor/tools/toolRegistry";

type Params = {
    engine: EngineInstance | null;
    selectedWallIds: Set<number>;
    setSelectedWallIds: (ids: Set<number>) => void;
    selectedFurnitureId: number | null;
    setSelectedFurnitureId: (id: number | null) => void;
    activeTool2D: ToolId;
    setTool2D: (m: WallToolId) => void;
    walls: Wall2D[];
    getActiveTool: () => ToolBase;
};

export function usePlanShortcuts({
    engine,
    selectedWallIds,
    setSelectedWallIds,
    selectedFurnitureId,
    setSelectedFurnitureId,
    activeTool2D,
    setTool2D,
    walls,
    getActiveTool,
}: Params): void {
    const getActiveToolRef = useRef(getActiveTool);
    getActiveToolRef.current = getActiveTool;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            ) return;

            const at = getActiveToolRef.current();

            if (e.key === "Delete" || e.key === "Backspace") {
                if (!engine) return;
                if (selectedFurnitureId != null) {
                    engine.api.transaction("delete furniture 2D", () => {
                        engine.api.dispatch({ type: "DELETE_FURNITURE", entityId: selectedFurnitureId });
                    });
                    setSelectedFurnitureId(null);
                } else if (selectedWallIds.size > 0) {
                    engine.api.transaction("delete walls", () => {
                        for (const id of selectedWallIds) {
                            engine.api.dispatch({ type: "REMOVE_WALL", wallId: id });
                        }
                    });
                    setSelectedWallIds(new Set());
                }
            }

            if (e.key === "a" && (e.ctrlKey || e.metaKey) && activeTool2D === "select") {
                e.preventDefault();
                setSelectedWallIds(new Set(walls.map((w: Wall2D) => w.id)));
            }

            if (e.key === "Escape") {
                // onCancel() handles each tool:
                //   placing → complete() → endPlacement2D() (atomic: activeTool2D→"select")
                //   draw    → clear drawState (stays in draw unless we explicitly switch)
                //   select  → cancelTransaction, clear drag state
                at.onCancel();
                setSelectedWallIds(new Set());
                if (activeTool2D === "draw") setTool2D("select");
            }

            if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault();
                engine?.api.undo();
                setSelectedWallIds(new Set());
                at.onCancel();
            }

            if (
                ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey)) ||
                ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && e.shiftKey)
            ) {
                e.preventDefault();
                engine?.api.redo();
                setSelectedWallIds(new Set());
                at.onCancel();
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // walls is included because Ctrl+A reads it to build the full selection set.
        // engine is included so undo/redo always close over the current instance.
    }, [engine, selectedWallIds, selectedFurnitureId, activeTool2D, walls]);
}
