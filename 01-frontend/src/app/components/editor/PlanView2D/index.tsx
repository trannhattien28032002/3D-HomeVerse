/**
 * PlanView2D — 2D floor plan host (Konva Stage + composed layers).
 * Đợt 6 refactor: logic tách vào usePlanCamera, usePlanInput, và các Layer file.
 * Layer z-order: Room → Wall → Furniture → Handle → Dimension → Overlay (tool+axes)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";

import { useFloorPlanSnapshot, type Node2D } from "src/app/store/useFloorPlanSnapshot";
import { useUIStore } from "src/app/store/useUIStore";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import { useEngineApi } from "src/app/hooks/useEngineApi";
import { usePlanShortcuts } from "src/app/hooks/usePlanShortcuts";
import WallPropertiesPanel from "src/app/components/editor/WallPropertiesPanel";
import type { PlaceFurnitureTool } from "src/app/components/editor/tools/PlaceFurnitureTool";
import type { ToolBase, ToolContext } from "src/app/components/editor/tools/ToolBase";
import { TOOL_IDS, type ToolId, type WallToolId, createToolInstances } from "src/app/components/editor/tools/toolRegistry";

import { usePlanCamera } from "./usePlanCamera";
import { usePlanInput } from "./usePlanInput";
import { RoomLayer } from "./RoomLayer";
import { WallLayer } from "./WallLayer";
import { FurnitureLayer } from "./FurnitureLayer";
import { HandleLayer } from "./HandleLayer";
import { DimensionLayer } from "./DimensionLayer";
import { OverlayLayer } from "./OverlayLayer";

export default function PlanView2D() {
    const viewportWidth  = useUIStore(s => s.viewportWidth);
    const viewportHeight = useUIStore(s => s.viewportHeight);
    const engine         = useEngineOrNull();
    const { nodes, walls, caps, rooms, dimensions, angleDimensions, furniture } = useFloorPlanSnapshot(viewportWidth, viewportHeight);

    const activeTool2D     = useUIStore(s => s.activeTool2D);
    const setTool2D        = useUIStore(s => s.setTool2D);
    const placementModelId = useUIStore(s => s.placementModelId);
    const endPlacement2D   = useUIStore(s => s.endPlacement2D);
    const originX = viewportWidth / 2;
    const originY = viewportHeight / 2;

    const { dispatch, withTransaction, beginTransaction, commitTransaction, cancelTransaction, nextNodeId, nextWallId } = useEngineApi();
    const toolMode: WallToolId = activeTool2D === "draw" ? "draw" : "select";
    const isSelectMode = activeTool2D === "select";

    // ── Selection ────────────────────────────────────────────────────────────
    const [selectedWallIds, setSelectedWallIds] = useState<Set<number>>(new Set());
    const [selectedFurnitureId, setSelectedFurnitureId] = useState<number | null>(null);
    useEffect(() => {
        if (selectedFurnitureId !== null && !furniture.some(f => f.entityId === selectedFurnitureId))
            setSelectedFurnitureId(null);
    }, [furniture, selectedFurnitureId]);
    const dragTransactionOpenRef = useRef(false);

    // ── Konva refs ───────────────────────────────────────────────────────────
    const transformerRef    = useRef<Konva.Transformer | null>(null);
    const furnitureNodeRefs = useRef(new Map<number, Konva.Group>());

    // ── Tool instances ───────────────────────────────────────────────────────
    const toolsRef = useRef(createToolInstances());
    const activeTool: ToolBase = toolsRef.current[activeTool2D];
    const prevTool2DRef = useRef<ToolId>("select");
    useEffect(() => {
        const prev = prevTool2DRef.current;
        prevTool2DRef.current = activeTool2D;
        if (prev !== activeTool2D) toolsRef.current[prev].deactivate();
        if (activeTool2D === "placing" && placementModelId)
            (toolsRef.current.placing as PlaceFurnitureTool).setTarget(placementModelId, endPlacement2D);
    }, [activeTool2D, placementModelId, endPlacement2D]);

    const [, setToolUpdateSeed] = useState(0);
    const requestUpdate = useCallback(() => setToolUpdateSeed(s => s + 1), []);

    useEffect(() => () => {
        for (const id of TOOL_IDS) toolsRef.current[id].deactivate();
        if (useUIStore.getState().placementModelId) useUIStore.getState().endPlacement2D();
        if (dragTransactionOpenRef.current) { cancelTransaction(); dragTransactionOpenRef.current = false; }
    }, []);

    // ── Camera + input ───────────────────────────────────────────────────────
    const camera = usePlanCamera(originX, originY);
    const { stageScale, stagePos, isPanning, ss, sh, gridSizePx, gridOffsetX, gridOffsetY } = camera;
    const inputHandlers = usePlanInput({ camera, isSelectMode, setSelectedFurnitureId, getActiveTool: () => activeTool });

    // ── Derived ──────────────────────────────────────────────────────────────
    const singleSelectedWall = useMemo(
        () => selectedWallIds.size === 1 ? walls.find(w => selectedWallIds.has(w.id)) ?? null : null,
        [walls, selectedWallIds],
    );
    const nodeById = useMemo(() => {
        const m = new Map<number, Node2D>();
        for (const n of nodes) m.set(n.id, n);
        return m;
    }, [nodes]);

    // ── ToolContext ──────────────────────────────────────────────────────────
    activeTool.update({
        nodes, walls, furniture, originX, originY,
        stageScale, stageScaleRef: camera.stageScaleRef, stagePosRef: camera.stagePosRef,
        nodeById, selectedWallIds, setSelectedWallIds,
        dispatch, withTransaction, beginTransaction, commitTransaction, cancelTransaction,
        nextNodeId, nextWallId, ss, sh, requestUpdate,
    } satisfies ToolContext);

    usePlanShortcuts({ engine, selectedWallIds, setSelectedWallIds, selectedFurnitureId, setSelectedFurnitureId, activeTool2D, setTool2D, walls, getActiveTool: () => activeTool });

    return (
        <div style={{ width: "100vw", height: "100vh", background: "#f7f3ea", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, color: "#504532", background: "rgba(253,249,240,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,222,166,0.4)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontFamily: "'Nunito Sans', sans-serif", userSelect: "none" }}>
                Plan 2D · {nodes.length} nodes · {walls.length} walls
                {selectedWallIds.size === 1 ? ` | Wall #${[...selectedWallIds][0]}` : selectedWallIds.size > 1 ? ` | ${selectedWallIds.size} walls selected` : ""}
                {" · "}<span style={{ opacity: 0.6 }}>{Math.round(stageScale * 100)}%</span>
            </div>

            <Stage
                width={viewportWidth} height={viewportHeight}
                x={stagePos.x} y={stagePos.y}
                scaleX={stageScale} scaleY={stageScale}
                style={{ display: "block", backgroundColor: "#f7f3ea", backgroundImage: `linear-gradient(rgba(213,196,172,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(213,196,172,0.5) 1px, transparent 1px)`, backgroundSize: `${gridSizePx}px ${gridSizePx}px`, backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`, cursor: isPanning ? "grabbing" : activeTool2D !== "select" ? "crosshair" : "default" }}
                onWheel={inputHandlers.onWheel}
                onMouseDown={inputHandlers.onMouseDown}
                onMouseMove={inputHandlers.onMouseMove}
                onMouseUp={inputHandlers.onMouseUp}
                onClick={inputHandlers.onClick}
                onContextMenu={inputHandlers.onContextMenu}
            >
                <RoomLayer rooms={rooms} stageScale={stageScale} activeTool2D={activeTool2D} setSelectedWallIds={setSelectedWallIds} ss={ss} />
                <WallLayer walls={walls} caps={caps} activeTool={activeTool} activeTool2D={activeTool2D} />
                <FurnitureLayer furniture={furniture} isSelectMode={isSelectMode} selectedFurnitureId={selectedFurnitureId} setSelectedFurnitureId={setSelectedFurnitureId} setSelectedWallIds={setSelectedWallIds} dragTransactionOpenRef={dragTransactionOpenRef} beginTransaction={beginTransaction} commitTransaction={commitTransaction} withTransaction={withTransaction} dispatch={dispatch} originX={originX} originY={originY} furnitureNodeRefs={furnitureNodeRefs} ss={ss} />
                <HandleLayer transformerRef={transformerRef} furnitureNodeRefs={furnitureNodeRefs} selectedFurnitureId={selectedFurnitureId} isSelectMode={isSelectMode} furniture={furniture} ss={ss} />
                <DimensionLayer dimensions={dimensions} angleDimensions={angleDimensions} stageScale={stageScale} ss={ss} />
                <OverlayLayer activeTool={activeTool} originX={originX} originY={originY} />
            </Stage>

            {toolMode === "select" && selectedWallIds.size > 0 && (
                <WallPropertiesPanel
                    wallIds={selectedWallIds}
                    initialThickness={singleSelectedWall ? Math.round(singleSelectedWall.thickness * 1000) : undefined}
                    initialHeight={singleSelectedWall ? Math.round(singleSelectedWall.height * 1000) : undefined}
                    onApply={(thickness, height) => {
                        withTransaction("update wall properties", () => {
                            for (const id of selectedWallIds)
                                dispatch({ type: "UPDATE_WALL", wallId: id, thickness, height });
                        });
                    }}
                />
            )}
        </div>
    );
}
