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
 *   useSelectionStore.selected        — nguồn duy nhất cho Material Sidebar (object/wall/room).
 *   useSelectionStore.selectedWallIds — multi-select tường 2D; tự động sync selected khi size===1.
 *   selectedFurnitureId / selectedRoomKey — derived từ selected, không là state riêng.
 *   Đã xóa 4 useEffect sync selection cũ (R6).
 *
 * Status bar (góc trên trái) hiển thị số node, wall, wall đang chọn, và zoom level.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect } from "react-konva";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import type Konva from "konva";

import { useFloorPlanSnapshot } from "src/app/store/useFloorPlanSnapshot";
import type { Node2D } from "src/app/features/plan2d/types";
import { buildPlanTransform } from "src/app/features/plan2d/PlanTransform";
import { buildWallSegments2D } from "src/app/features/plan2d/wallSegments2D";
import { useUIStore } from "src/app/store/useUIStore";
import { useSelectionStore } from "src/app/store/useSelectionStore";
import { useEngineOrNull } from "src/app/engineBinding/EngineContext";
import { useEngineApi } from "src/app/hooks/useEngineApi";
import { usePlanShortcuts } from "src/app/hooks/usePlanShortcuts";
import WallPropertiesPanel from "src/app/components/editor/panels/WallPropertiesPanel";
import type { PlaceFurnitureTool } from "src/app/components/editor/tools/PlaceFurnitureTool";
import type { WallPlacementTool } from "src/app/components/editor/tools/WallPlacementTool";
import type { ToolBase, ToolContext } from "src/app/components/editor/tools/ToolBase";
import { TOOL_IDS, type ToolId, type WallToolId, createToolInstances } from "src/app/components/editor/tools/toolRegistry";

import { usePlanCamera } from "src/app/features/plan2d/hooks/usePlanCamera";
import { usePlanInput } from "src/app/features/plan2d/hooks/usePlanInput";
import { usePlanPerfProbe } from "src/app/features/plan2d/hooks/usePlanPerfProbe";
import { useVisibleFurniture } from "src/app/features/plan2d/hooks/useVisibleFurniture";
import { RoomLayer } from "src/app/features/plan2d/layers/RoomLayer";
import { WallLayer } from "src/app/features/plan2d/layers/WallLayer";
import { FurnitureLayer } from "src/app/features/plan2d/layers/FurnitureLayer";
import { HandleLayer } from "src/app/features/plan2d/layers/HandleLayer";
import { DimensionLayer } from "src/app/features/plan2d/layers/DimensionLayer";
import { OverlayLayer } from "src/app/features/plan2d/layers/OverlayLayer";

/** P2 cache: các mốc zoom để quantize pixelRatio cache bitmap (tránh re-cache mỗi tick).
 *  Trần ở 4: pixelRatio tối đa dpr*4 — đủ nét khi zoom sâu mà không tạo bitmap khổng lồ. */
const CACHE_SCALE_MILESTONES = [0.5, 1, 2, 4];

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
    // M-2: memoize PlanTransform — rebuilt only when viewport dimensions change.
    const transform = useMemo(
        () => buildPlanTransform(viewportWidth, viewportHeight),
        [viewportWidth, viewportHeight],
    );

    const { dispatch, dispatchAsync, withTransaction, asyncTransaction, beginTransaction, commitTransaction, cancelTransaction, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo, nextNodeId, nextWallId, wouldFurnitureCollide } = useEngineApi();
    const toolMode: WallToolId = activeTool2D === "draw" ? "draw" : "select";
    const isSelectMode = activeTool2D === "select";
    const isPlacingWall = activeTool2D === "placing-wall";

    // ── Selection (R6 — single owner in useSelectionStore) ───────────────────
    // selectedWallIds và selected là nguồn sự thật duy nhất. Không có local useState
    // hay useEffect sync — thay bằng derived values thuần.
    const selectedWallIds        = useSelectionStore(s => s.selectedWallIds);
    const setSelectedWallIds     = useSelectionStore(s => s.setSelectedWallIds);
    const selectedFurnitureIds   = useSelectionStore(s => s.selectedFurnitureIds);
    const setSelectedFurnitureIds = useSelectionStore(s => s.setSelectedFurnitureIds);
    const selectAll2D            = useSelectionStore(s => s.selectAll2D);
    const selected               = useSelectionStore(s => s.selected);
    const setSelected            = useSelectionStore(s => s.setSelected);

    // Derived — không là state. selectedFurnitureId (single) chỉ dùng cho transformer/flip;
    // multi-select sống ở selectedFurnitureIds.
    const selectedFurnitureId: string | null = selectedFurnitureIds.size === 1 ? [...selectedFurnitureIds][0] : null;

    // Auto-clear: bỏ khỏi set những object không còn trong snapshot
    // (e.g. xóa qua Delete shortcut rồi undo). Guard reactive, không phải sync logic.
    useEffect(() => {
        if (selectedFurnitureIds.size === 0) return;
        // MD-04: O(furniture + selection) — build a Set of live ids once instead of
        // furniture.some() inside filter() (which was O(selection × furniture)).
        const live = new Set(furniture.map(f => f.entityId));
        const alive = [...selectedFurnitureIds].filter(id => live.has(id));
        if (alive.length !== selectedFurnitureIds.size) setSelectedFurnitureIds(new Set(alive));
    }, [furniture, selectedFurnitureIds, setSelectedFurnitureIds]);

    /** Hàm helper: đặt furniture selection đơn (null = bỏ chọn). Store tự cross-clear tường. */
    const setSelectedFurnitureId = useCallback((id: string | null) => {
        setSelectedFurnitureIds(id === null ? new Set() : new Set([id]));
    }, [setSelectedFurnitureIds]);

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
    const marqueeRef        = useRef<Konva.Rect | null>(null);

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
    const camera = usePlanCamera(transform.originX, transform.originY);
    const { stageScale, stagePos, isPanning, ss, sh, gridSizePx, gridOffsetX, gridOffsetY, stageRef } = camera;
    // P0 (DEV-only) — đo tần suất render + số node Konva khi tương tác 2D.
    usePlanPerfProbe(stageRef);

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
        () => buildWallSegments2D(walls, nodeById, transform),
        [walls, nodeById, transform],
    );

    // ── Camera input + marquee box-select (định nghĩa sau nodeById vì marquee cần) ──
    const inputHandlers = usePlanInput({
        camera, isSelectMode, getActiveTool: () => activeTool,
        furniture, walls, nodeById, setSelectedFurnitureIds, setSelectedWallIds, marqueeRef,
        setSelectedRoomKey: (key) => {
            // Chọn phòng — loại trừ furniture/tường để 3 loại không chồng nhau.
            if (key === null) {
                if (selected?.kind === "room") setSelected(null);
            } else {
                setSelected({ kind: "room", id: key });
                if (selectedWallIds.size > 0) setSelectedWallIds(new Set());
            }
        },
    });

    // ── Phase 2 perf: viewport culling + label LOD ────────────────────────────
    // Chỉ render furniture cắt khung nhìn (object đang chọn luôn được giữ để
    // Transformer còn node bám). Chi phí vẽ + hit-graph → O(số object trong khung).
    const visibleFurniture = useVisibleFurniture(
        furniture, stagePos, stageScale, viewportWidth, viewportHeight, selectedFurnitureIds,
    );
    // LOD nhãn (P2): chỉ ẩn khi zoom quá xa (chữ nhỏ không đọc được nữa). KHÔNG ẩn
    // theo số lượng đồ: nhãn đã nằm trong bitmap cache (raster 1 lần), không tốn mỗi
    // frame nên hiển thị hàng trăm nhãn vẫn rẻ.
    const showFurnitureLabels = stageScale >= 0.4;
    // pixelRatio cache bitmap đồ (P2): quantize theo mốc zoom để ảnh nét ở mức zoom
    // hiện tại nhưng KHÔNG re-cache mỗi tick wheel. Bám devicePixelRatio cho màn Retina.
    const cachePixelRatio = useMemo(() => {
        const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
        const milestone = CACHE_SCALE_MILESTONES.find(m => m >= stageScale) ?? CACHE_SCALE_MILESTONES[CACHE_SCALE_MILESTONES.length - 1];
        return dpr * milestone;
    }, [stageScale]);

    // ── ToolContext ──────────────────────────────────────────────────────────
    activeTool.update({
        nodes, walls, furniture, transform,
        stageScale, stageScaleRef: camera.stageScaleRef, stagePosRef: camera.stagePosRef,
        nodeById, selectedWallIds, setSelectedWallIds,
        dispatch, dispatchAsync, withTransaction, asyncTransaction,
        beginTransaction, commitTransaction, cancelTransaction,
        nextNodeId, nextWallId, ss, sh, requestUpdate,
    } satisfies ToolContext);

    usePlanShortcuts({ engine, selectedWallIds, setSelectedWallIds, selectedFurnitureId, setSelectedFurnitureId, selectedFurnitureIds, setSelectedFurnitureIds, selectAll2D, activeTool2D, setTool2D, walls, furniture, getActiveTool: () => activeTool });

    return (
        <div style={{ width: "100vw", height: "100vh", background: "#f7f3ea", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, color: "#504532", background: "rgba(253,249,240,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,222,166,0.4)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontFamily: "'Nunito Sans', sans-serif", userSelect: "none" }}>
                Plan 2D · {nodes.length} nodes · {walls.length} walls
                {selectedWallIds.size === 1 ? ` | Wall #${[...selectedWallIds][0]}` : selectedWallIds.size > 1 ? ` | ${selectedWallIds.size} walls selected` : ""}
                {selectedFurnitureIds.size > 1 ? ` | ${selectedFurnitureIds.size} objects selected` : ""}
                {" · "}<span style={{ opacity: 0.6 }}>{Math.round(stageScale * 100)}%</span>
            </div>

            <Stage
                ref={stageRef}
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
                <WallLayer walls={walls} caps={caps} furniture={furniture} activeTool={activeTool} activeTool2D={activeTool2D} nodeById={nodeById} selectedWallIds={selectedWallIds} />
                <FurnitureLayer furniture={furniture} renderFurniture={visibleFurniture} showLabels={showFurnitureLabels} cachePixelRatio={cachePixelRatio} isSelectMode={isSelectMode} selectedFurnitureIds={selectedFurnitureIds} setSelectedFurnitureIds={setSelectedFurnitureIds} dragTransactionOpenRef={dragTransactionOpenRef} recordMoveUndo={recordMoveUndo} recordRotateUndo={recordRotateUndo} recordWallItemMoveUndo={recordWallItemMoveUndo} wouldFurnitureCollide={wouldFurnitureCollide} withTransaction={withTransaction} dispatch={dispatch} transform={transform} wallSegments={wallSegments} walls={walls} nodeById={nodeById} furnitureNodeRefs={furnitureNodeRefs} ss={ss} />
                <HandleLayer transformerRef={transformerRef} furnitureNodeRefs={furnitureNodeRefs} selectedFurnitureIds={selectedFurnitureIds} isSelectMode={isSelectMode} furniture={furniture} ss={ss} />
                <DimensionLayer dimensions={dimensions} angleDimensions={angleDimensions} stageScale={stageScale} ss={ss} />
                <OverlayLayer activeTool={activeTool} transform={transform} />
                {/* Marquee box-select — điều khiển imperative qua marqueeRef khi kéo (Phase 5). */}
                <Layer listening={false}>
                    <Rect ref={marqueeRef} fill={alpha(RGB.primaryContainer, 0.12)} stroke={T.primaryContainer} strokeWidth={ss(1)} dash={[ss(4), ss(3)]} visible={false} perfectDrawEnabled={false} />
                </Layer>
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
