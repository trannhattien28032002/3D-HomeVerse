/**
 * Container chính của Plan 2D — tích hợp toàn bộ các layer Konva và tool system.
 *
 * Kiến trúc layer (thứ tự từ dưới lên):
 *   RoomLayer → WallLayer → FurnitureLayer → HandleLayer → DimensionLayer → OverlayLayer
 *
 * Tool system:
 *   - createToolInstances() tạo 1 instance/tool một lần (toolsRef).
 *   - activeTool2D xác định tool nào active; khi đổi tool, deactivate tool cũ.
 *   - activeTool.update(ctx) cập nhật ToolContext mỗi render để tool luôn có dữ liệu mới nhất.
 *
 * Camera:
 *   usePlanCamera → stageScale, stagePos, pan, zoom, helper ss()/sh().
 *   usePlanInput  → wheel/mouse handlers delegate xuống activeTool hoặc camera pan.
 *
 * Selection (R6 — single owner):
 *   useUIStore.selected        — nguồn duy nhất cho Material Sidebar (object/wall/room).
 *   useUIStore.selectedWallIds — multi-select tường 2D; tự động sync selected khi size===1.
 *   selectedFurnitureId / selectedRoomKey — derived từ selected, không là state riêng.
 *   Đã xóa 4 useEffect sync selection cũ (R6).
 *
 * Status bar (góc trên trái) hiển thị số node, wall, wall đang chọn, và zoom level.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";

import { useFloorPlanSnapshot } from "src/app/store/useFloorPlanSnapshot";
import type { Node2D } from "src/app/plan2d/types";
import { buildPlanTransform } from "src/app/plan2d/PlanTransform";
import { buildWallSegments2D } from "./wallSegments2D";
import { useUIStore } from "src/app/store/useUIStore";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import { useEngineApi } from "src/app/hooks/useEngineApi";
import { usePlanShortcuts } from "src/app/hooks/usePlanShortcuts";
import WallPropertiesPanel from "src/app/components/editor/WallPropertiesPanel";
import type { PlaceFurnitureTool } from "src/app/components/editor/tools/PlaceFurnitureTool";
import type { WallPlacementTool } from "src/app/components/editor/tools/WallPlacementTool";
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
    const snap = useFloorPlanSnapshot(viewportWidth, viewportHeight);
    const { nodes, furniture } = snap;

    const activeTool2D         = useUIStore(s => s.activeTool2D);
    const setTool2D            = useUIStore(s => s.setTool2D);
    const placementModelId     = useUIStore(s => s.placementModelId);
    const endPlacement2D       = useUIStore(s => s.endPlacement2D);
    const wallPlacementModelId = useUIStore(s => s.wallPlacementModelId);
    const endWallPlacement2D   = useUIStore(s => s.endWallPlacement2D);
    const originX = viewportWidth / 2;
    const originY = viewportHeight / 2;
    // R5: single PlanTransform object — threads through ToolContext to eliminate
    // scattered `* 100` / PX_PER_WORLD literals. Rebuilt only when viewport changes.
    const transform = buildPlanTransform(viewportWidth, viewportHeight);

    const { dispatch, dispatchAsync, withTransaction, asyncTransaction, beginTransaction, commitTransaction, cancelTransaction, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo, nextNodeId, nextWallId } = useEngineApi();
    const toolMode: WallToolId = activeTool2D === "draw" ? "draw" : "select";
    const isSelectMode = activeTool2D === "select";
    const isPlacingWall = activeTool2D === "placing-wall";

    // ── Selection (R6 — single owner in useUIStore) ──────────────────────────
    // selectedWallIds và selected là nguồn sự thật duy nhất. Không có local useState
    // hay useEffect sync — thay bằng derived values thuần.
    const selectedWallIds    = useUIStore(s => s.selectedWallIds);
    const setSelectedWallIds = useUIStore(s => s.setSelectedWallIds);
    const selected           = useUIStore(s => s.selected);
    const setSelected        = useUIStore(s => s.setSelected);

    // Derived — không là state, tính inline từ selected.
    const selectedFurnitureId: string | null = selected?.kind === "object" ? selected.id : null;
    const selectedRoomKey:     string | null = selected?.kind === "room"   ? selected.id : null;

    // Auto-clear furniture selection nếu entity đó không còn trong snapshot
    // (e.g. xóa qua Delete shortcut rồi undo). Đây là 1 useEffect duy nhất còn lại —
    // không thể bỏ vì đây là guard reactive, không phải sync logic.
    useEffect(() => {
        if (selectedFurnitureId !== null && !furniture.some(f => f.entityId === selectedFurnitureId))
            setSelected(null);
    }, [furniture, selectedFurnitureId, setSelected]);

    /** Hàm helper: đặt furniture selection và clear wall/room. */
    const setSelectedFurnitureId = useCallback((id: string | null) => {
        if (id === null) {
            if (selected?.kind === "object") setSelected(null);
        } else {
            setSelected({ kind: "object", id });
            // Clear wall multi-select khi chọn furniture.
            if (selectedWallIds.size > 0) setSelectedWallIds(new Set());
        }
    }, [selected, setSelected, selectedWallIds, setSelectedWallIds]);

    const dragTransactionOpenRef = useRef(false);

    // ── Freeze topology layers during drag (R2) ──────────────────────────────
    // Khi drag furniture (dragTransactionOpenRef = true), topology tường/phòng/dimension
    // không thay đổi — đóng băng các collection này để WallLayer/RoomLayer/DimensionLayer
    // không re-render trong suốt gesture kéo. Chỉ FurnitureLayer (với furniture prop) render.
    //
    // Chú ý: SnapshotSystem vẫn emit mỗi frame khi revision đổi (MOVE_FURNITURE dispatch
    // mỗi onDragEnd) — nhưng nhờ useMemo per-collection, chỉ snap.furniture thay đổi.
    // Các ref dưới đây freeze thêm một lớp nữa cho walls/rooms/dims khi đang drag.
    const stableWallsRef     = useRef(snap.walls);
    const stableCapsRef      = useRef(snap.caps);
    const stableRoomsRef     = useRef(snap.rooms);
    const stableDimsRef      = useRef(snap.dimensions);
    const stableAngleDimsRef = useRef(snap.angleDimensions);

    // Cập nhật các ref khi KHÔNG đang drag — đảm bảo topology luôn mới nhất sau gesture.
    if (!dragTransactionOpenRef.current) {
        stableWallsRef.current     = snap.walls;
        stableCapsRef.current      = snap.caps;
        stableRoomsRef.current     = snap.rooms;
        stableDimsRef.current      = snap.dimensions;
        stableAngleDimsRef.current = snap.angleDimensions;
    }

    const walls          = stableWallsRef.current;
    const caps           = stableCapsRef.current;
    const rooms          = stableRoomsRef.current;
    const dimensions     = stableDimsRef.current;
    const angleDimensions = stableAngleDimsRef.current;

    // ── Konva refs ───────────────────────────────────────────────────────────
    const transformerRef    = useRef<Konva.Transformer | null>(null);
    const furnitureNodeRefs = useRef(new Map<string, Konva.Group>());

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
        if (activeTool2D === "placing-wall" && wallPlacementModelId)
            (toolsRef.current["placing-wall"] as WallPlacementTool).setTarget(wallPlacementModelId, endWallPlacement2D);
    }, [activeTool2D, placementModelId, endPlacement2D, wallPlacementModelId, endWallPlacement2D]);

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
    const inputHandlers = usePlanInput({ camera, isSelectMode, setSelectedFurnitureId, setSelectedRoomKey: (key) => {
        // Chọn phòng — loại trừ furniture/tường để 3 loại không chồng nhau.
        if (key === null) {
            if (selected?.kind === "room") setSelected(null);
        } else {
            setSelected({ kind: "room", id: key });
            if (selectedWallIds.size > 0) setSelectedWallIds(new Set());
        }
    }, getActiveTool: () => activeTool });

    // Chọn phòng (từ RoomLayer) — loại trừ furniture/tường để 3 loại không chồng nhau.
    const handleSelectRoom = useCallback((roomKey: string) => {
        setSelected({ kind: "room", id: roomKey });
        if (selectedWallIds.size > 0) setSelectedWallIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setSelected, setSelectedWallIds]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const singleSelectedWall = useMemo(
        () => selectedWallIds.size === 1 ? walls.find(w => selectedWallIds.has(w.id)) ?? null : null,
        [walls, selectedWallIds],
    );
    const nodeById = useMemo(() => {
        const m = new Map<string, Node2D>();
        for (const n of nodes) m.set(n.id, n);
        return m;
    }, [nodes]);

    // Tường ở world-space (mét) cho wall-snap khi kéo nội thất.
    const wallSegments = useMemo(
        () => buildWallSegments2D(walls, nodeById, originX, originY),
        [walls, nodeById, originX, originY],
    );

    // ── ToolContext ──────────────────────────────────────────────────────────
    activeTool.update({
        nodes, walls, furniture, transform, originX, originY,
        stageScale, stageScaleRef: camera.stageScaleRef, stagePosRef: camera.stagePosRef,
        nodeById, selectedWallIds, setSelectedWallIds,
        dispatch, dispatchAsync, withTransaction, asyncTransaction,
        beginTransaction, commitTransaction, cancelTransaction,
        nextNodeId, nextWallId, ss, sh, requestUpdate,
    } satisfies ToolContext);

    const selectedIsWallItem = selectedFurnitureId != null && (furniture.find(f => f.entityId === selectedFurnitureId)?.isWallItem ?? false);

    usePlanShortcuts({ engine, selectedWallIds, setSelectedWallIds, selectedFurnitureId, setSelectedFurnitureId, activeTool2D, setTool2D, walls, furniture, getActiveTool: () => activeTool });

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
                style={{ display: "block", backgroundColor: "#f7f3ea", backgroundImage: `linear-gradient(rgba(213,196,172,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(213,196,172,0.5) 1px, transparent 1px)`, backgroundSize: `${gridSizePx}px ${gridSizePx}px`, backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`, cursor: isPanning ? "grabbing" : (activeTool2D !== "select" || isPlacingWall) ? "crosshair" : "default" }}
                onWheel={inputHandlers.onWheel}
                onMouseDown={inputHandlers.onMouseDown}
                onMouseMove={inputHandlers.onMouseMove}
                onMouseUp={inputHandlers.onMouseUp}
                onClick={inputHandlers.onClick}
                onContextMenu={inputHandlers.onContextMenu}
            >
                <RoomLayer rooms={rooms} stageScale={stageScale} activeTool2D={activeTool2D} onSelectRoom={handleSelectRoom} ss={ss} />
                <WallLayer walls={walls} caps={caps} furniture={furniture} activeTool={activeTool} activeTool2D={activeTool2D} nodeById={nodeById} />
                <FurnitureLayer furniture={furniture} isSelectMode={isSelectMode} selectedFurnitureId={selectedFurnitureId} setSelectedFurnitureId={setSelectedFurnitureId} setSelectedWallIds={setSelectedWallIds} dragTransactionOpenRef={dragTransactionOpenRef} recordMoveUndo={recordMoveUndo} recordRotateUndo={recordRotateUndo} recordWallItemMoveUndo={recordWallItemMoveUndo} dispatch={dispatch} originX={originX} originY={originY} wallSegments={wallSegments} walls={walls} nodeById={nodeById} furnitureNodeRefs={furnitureNodeRefs} ss={ss} />
                <HandleLayer transformerRef={transformerRef} furnitureNodeRefs={furnitureNodeRefs} selectedFurnitureId={selectedFurnitureId} isSelectMode={isSelectMode} furniture={furniture} selectedIsWallItem={selectedIsWallItem} ss={ss} />
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
