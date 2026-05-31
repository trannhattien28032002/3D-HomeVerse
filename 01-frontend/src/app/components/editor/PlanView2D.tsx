/**
 * PlanView2D — bản vẽ mặt bằng 2D dùng Konva (React canvas library).
 *
 * Đây là component lớn nhất, đóng vai trò HOST cho tất cả tương tác người dùng
 * trong chế độ Floor Plan (tab 2D).
 *
 * Trách nhiệm:
 *   - Render wall polygon, node cap, room fill, dimension, angle annotation
 *   - Xử lý pan (middle mouse) và zoom (wheel) của Konva Stage
 *   - Delegate mouse events xuống tool hiện tại (DrawWallTool / SelectTool)
 *   - Keyboard shortcuts: Delete, Ctrl+A, Escape, Ctrl+Z, Ctrl+Y
 *   - Hiển thị WallPropertiesPanel khi có tường được chọn
 *
 * Kiến trúc Layer Konva (thứ tự từ dưới lên — z-index):
 *   1. Room fills (listening: select mode)
 *   2. Room area labels (non-interactive)
 *   3. Wall outlines/strokes (non-interactive)
 *   4. Wall fills + tool handlers (listening: select mode)
 *   5. Dimension annotations (non-interactive)
 *   6. Angle arc annotations (non-interactive)
 *   7. Tool overlay (handles, preview, highlights)
 *   8. Axes XZ (always on top, non-interactive)
 *
 * Scale compensation (ss, sh):
 *   Konva scale toàn bộ canvas khi zoom — text/stroke phải chia ngược lại
 *   để giữ kích thước visual ổn định khi người dùng zoom in/out.
 *
 * State management:
 *   - nodes/walls/caps/rooms: từ useFloorPlanStore (subscribe ECS snapshot)
 *   - stageScale/stagePos: local state cho pan/zoom
 *   - selectedWallIds: local state — shared xuống WallPropertiesPanel + ToolContext
 *   - toolMode: controlled từ EditorPage hoặc internal (fallback)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arc, Arrow, Group, Layer, Line, Rect, Stage, Circle, Text } from "react-konva";

import { useFloorPlanStore, type Node2D, type Wall2D } from "src/app/store/useFloorPlanStore";
import { useUIStore } from "src/app/store/useUIStore";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import WallPropertiesPanel from "src/app/components/editor/WallPropertiesPanel";

import { DrawWallTool } from "src/app/components/editor/tools/DrawWallTool";
import { SelectTool } from "src/app/components/editor/tools/SelectTool";
import type { ToolBase, ToolContext } from "src/app/components/editor/tools/ToolBase";

// ============================================================
// Constants (chỉ dùng trong host — không liên quan đến ECS)
// ============================================================

const GRID_SIZE          = 100;          // px — kích thước ô lưới CSS background
const ZOOM_MIN           = 0.1;          // scale tối thiểu
const ZOOM_MAX           = 8;            // scale tối đa
const ZOOM_FACTOR        = 1.12;         // nhân/chia mỗi bước scroll
const DIM_OFFSET         = Math.round(0.3 * 100); // 300mm offset vuông góc với tường
const ANGLE_ARC_RADIUS   = 28;           // px — bán kính arc khi scale = 1
const ANNOTATION_SCALE_MIN = 0.35;       // clamp dưới cho scale compensation (ss)
const DIM_HIDE_BELOW     = 0.25;         // ẩn dimension khi zoom quá nhỏ
const ANGLE_HIDE_BELOW   = 0.40;         // ẩn angle arc khi zoom quá nhỏ
const MIN_DIM_LENGTH_M   = 0.25;         // ẩn dimension của tường quá ngắn (< 250mm)

// ============================================================
// Module-level engine helpers — tham chiếu stable, an toàn đưa vào ToolContext
// Dùng window.gameEngine thay vì closure để luôn trỏ đúng instance (kể cả sau HMR)
// ============================================================

/** Gửi command vào engine dispatcher. Warn nếu engine chưa sẵn sàng. */
function dispatch(cmd: EngineCommand) {
    if (!window.gameEngine) {
        console.warn("[PlanView2D] dispatch called before engine init:", cmd.type);
        return;
    }
    window.gameEngine.api.dispatch(cmd);
}

/** Chạy fn() trong một transaction nguyên tử — tất cả dispatch bên trong thành 1 undo entry. */
function withTransaction(label: string, fn: () => void) {
    const eng = window.gameEngine;
    if (!eng) { fn(); return; }
    eng.api.transaction(label, fn);
}

/** Mở transaction thủ công — dùng cho drag thao tác nhiều event (onDragStart). */
function beginTransaction(label: string) {
    window.gameEngine?.api.beginTransaction(label);
}

/** Đóng transaction và push vào undo stack (onDragEnd). */
function commitTransaction() {
    window.gameEngine?.api.commitTransaction();
}

/** Hủy transaction không push vào undo stack (onCancel, Escape). */
function cancelTransaction() {
    window.gameEngine?.api.cancelTransaction();
}

// ============================================================
// Types
// ============================================================

type ToolMode = "select" | "draw";

type PlanView2DProps = {
    toolMode?: ToolMode;
    onToolModeChange?: (mode: ToolMode) => void;
};

// ============================================================
// Component
// ============================================================

export default function PlanView2D({ toolMode: extToolMode, onToolModeChange }: PlanView2DProps = {}) {
    const viewportWidth  = useUIStore(s => s.viewportWidth);
    const viewportHeight = useUIStore(s => s.viewportHeight);
    const engine = useEngineOrNull();

    const { nodes, walls, caps, rooms, dimensions, angleDimensions } = useFloorPlanStore(viewportWidth, viewportHeight);

    const originX = viewportWidth  / 2;
    const originY = viewportHeight / 2;

    function nextNodeId() { return engine?.nodes.nextAvailableNodeId() ?? window.gameEngine?.nodes.nextAvailableNodeId() ?? 100; }
    function nextWallId() { return engine?.api.getNextIds()?.wallId ?? window.gameEngine?.api.getNextIds()?.wallId ?? 50; }

    // ── Tool mode ─────────────────────────────────────────────────────────────
    const [internalToolMode, setInternalToolMode] = useState<ToolMode>("select");
    const toolMode = extToolMode ?? internalToolMode;
    function setToolMode(m: ToolMode) {
        setInternalToolMode(m);
        onToolModeChange?.(m);
    }

    // ── Selection state (owned here; needed by WallPropertiesPanel + status bar) ─
    const [selectedWallIds, setSelectedWallIds] = useState<Set<number>>(new Set());

    // ── Tool instances (stable across renders) ────────────────────────────────
    // useRef đảm bảo tool objects không bị recreate mỗi render — giữ internal state
    const drawWallTool = useRef(new DrawWallTool());
    const selectTool   = useRef(new SelectTool());
    const activeTool: ToolBase = toolMode === "draw" ? drawWallTool.current : selectTool.current;

    // requestUpdate: trigger re-render khi tool cập nhật imperative state
    // (ví dụ: DrawWallTool set drawState sau click đầu — không có dispatch nào fire)
    const [, setToolUpdateSeed] = useState(0);
    const requestUpdate = useCallback(() => setToolUpdateSeed(s => s + 1), []);

    // Deactivate the OLD tool whenever mode switches
    useEffect(() => {
        const prev = toolMode === "draw" ? selectTool.current : drawWallTool.current;
        prev.deactivate();
    }, [toolMode]);

    // Cleanup on unmount
    useEffect(() => () => {
        drawWallTool.current.deactivate();
        selectTool.current.deactivate();
    }, []);

    // ── Pan / Zoom ────────────────────────────────────────────────────────────
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const stageScaleRef = useRef(1);
    const stagePosRef   = useRef({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef<{ mouseX: number; mouseY: number; stageX: number; stageY: number } | null>(null);

    function applyTransform(newScale: number, newPos: { x: number; y: number }) {
        stageScaleRef.current = newScale;
        stagePosRef.current   = newPos;
        setStageScale(newScale);
        setStagePos(newPos);
    }

    // ── Derived ───────────────────────────────────────────────────────────────
    const singleSelectedWall = useMemo(
        () => selectedWallIds.size === 1 ? walls.find(w => selectedWallIds.has(w.id)) ?? null : null,
        [walls, selectedWallIds],
    );

    const nodeById = useMemo(() => {
        const m = new Map<number, Node2D>();
        for (const n of nodes) m.set(n.id, n);
        return m;
    }, [nodes]);

    // ── Scale compensation ────────────────────────────────────────────────────
    // ss(px): trả về px / scale — dùng cho text/stroke/radius để giữ kích thước visual không đổi khi zoom
    // sh(px): tương tự nhưng không clamp (dùng cho handle radius)
    const eff = Math.max(ANNOTATION_SCALE_MIN, stageScale);
    const ss  = (px: number) => px / eff;
    const sh  = (px: number) => px / stageScale;

    // ── CSS grid background — căn chỉnh với Konva Stage transform ───────────
    // Tính offset lưới CSS để khớp với Konva origin + pan offset
    const gridSizePx  = GRID_SIZE * stageScale;
    const gridOffsetX = ((originX * stageScale + stagePos.x) % gridSizePx + gridSizePx) % gridSizePx;
    const gridOffsetY = ((originY * stageScale + stagePos.y) % gridSizePx + gridSizePx) % gridSizePx;

    // ── Build ToolContext và push xuống activeTool mỗi render ────────────────
    // Tool nhận context mới mỗi render → luôn có data mới nhất (không stale closure)
    const toolCtx: ToolContext = {
        nodes, walls, originX, originY,
        stageScale, stageScaleRef, stagePosRef,
        nodeById, selectedWallIds, setSelectedWallIds,
        dispatch, withTransaction, beginTransaction, commitTransaction, cancelTransaction,
        nextNodeId, nextWallId,
        ss, sh, requestUpdate,
    };
    activeTool.update(toolCtx);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const at = toolMode === "draw" ? drawWallTool.current : selectTool.current;

            if ((e.key === "Delete" || e.key === "Backspace") && selectedWallIds.size > 0) {
                withTransaction("delete walls", () => {
                    for (const id of selectedWallIds) dispatch({ type: "REMOVE_WALL", wallId: id });
                });
                setSelectedWallIds(new Set());
            }
            if (e.key === "a" && (e.ctrlKey || e.metaKey) && toolMode === "select") {
                e.preventDefault();
                setSelectedWallIds(new Set(walls.map((w: Wall2D) => w.id)));
            }
            if (e.key === "Escape") {
                at.onCancel();
                setSelectedWallIds(new Set());
                if (toolMode === "draw") setToolMode("select");
            }
            if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault();
                window.gameEngine?.api.undo();
                setSelectedWallIds(new Set());
                at.onCancel();
            }
            if (
                ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey)) ||
                ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && e.shiftKey)
            ) {
                e.preventDefault();
                window.gameEngine?.api.redo();
                setSelectedWallIds(new Set());
                at.onCancel();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selectedWallIds, toolMode, walls]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ width: "100vw", height: "100vh", background: "#f7f3ea", position: "relative", overflow: "hidden" }}>

            {/* Status bar */}
            <div style={{
                position: "absolute", top: 12, left: 12, zIndex: 10,
                color: "#504532", background: "rgba(253,249,240,0.75)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,222,166,0.4)", borderRadius: 10,
                padding: "6px 12px", fontSize: 12, fontFamily: "'Nunito Sans', sans-serif",
                userSelect: "none",
            }}>
                Plan 2D · {nodes.length} nodes · {walls.length} walls
                {selectedWallIds.size === 1
                    ? ` | Wall #${[...selectedWallIds][0]}`
                    : selectedWallIds.size > 1
                    ? ` | ${selectedWallIds.size} walls selected`
                    : ""}
                {" · "}
                <span style={{ opacity: 0.6 }}>{Math.round(stageScale * 100)}%</span>
            </div>

            <Stage
                width={viewportWidth}
                height={viewportHeight}
                x={stagePos.x}
                y={stagePos.y}
                scaleX={stageScale}
                scaleY={stageScale}
                style={{
                    display: "block",
                    backgroundColor: "#f7f3ea",
                    backgroundImage: `linear-gradient(rgba(213,196,172,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(213,196,172,0.5) 1px, transparent 1px)`,
                    backgroundSize: `${gridSizePx}px ${gridSizePx}px`,
                    backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`,
                    cursor: isPanning ? "grabbing" : toolMode === "draw" ? "crosshair" : "default",
                }}

                // ── Zoom ──────────────────────────────────────────────────────
                onWheel={e => {
                    e.evt.preventDefault();
                    const stage = e.target.getStage();
                    if (!stage) return;
                    const pointer   = stage.getPointerPosition()!;
                    const oldScale  = stageScaleRef.current;
                    const oldPos    = stagePosRef.current;
                    const factor    = e.evt.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
                    const newScale  = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldScale * factor));
                    const mousePointTo = {
                        x: (pointer.x - oldPos.x) / oldScale,
                        y: (pointer.y - oldPos.y) / oldScale,
                    };
                    applyTransform(newScale, {
                        x: pointer.x - mousePointTo.x * newScale,
                        y: pointer.y - mousePointTo.y * newScale,
                    });
                }}

                // ── Mouse down — pan start + delegate to tool ─────────────────
                onMouseDown={e => {
                    if (e.evt.button === 1) {
                        e.evt.preventDefault();
                        setIsPanning(true);
                        panStartRef.current = {
                            mouseX: e.evt.clientX, mouseY: e.evt.clientY,
                            stageX: stagePosRef.current.x, stageY: stagePosRef.current.y,
                        };
                        return;
                    }
                    activeTool.onStageMouseDown(e);
                }}

                // ── Mouse move — pan + delegate to tool ───────────────────────
                onMouseMove={e => {
                    if (isPanning && panStartRef.current) {
                        const newPos = {
                            x: panStartRef.current.stageX + e.evt.clientX - panStartRef.current.mouseX,
                            y: panStartRef.current.stageY + e.evt.clientY - panStartRef.current.mouseY,
                        };
                        stagePosRef.current = newPos;
                        setStagePos(newPos);
                        return;
                    }
                    activeTool.onStageMouseMove(e);
                }}

                // ── Mouse up — pan end ────────────────────────────────────────
                onMouseUp={e => {
                    if (e.evt.button === 1) {
                        setIsPanning(false);
                        panStartRef.current = null;
                    }
                }}

                // ── Click + context menu → active tool ────────────────────────
                onClick={e => activeTool.onStageClick(e)}
                onContextMenu={e => activeTool.onStageContextMenu(e)}
            >
                {/* ── Room fills ─────────────────────────────────────────── */}
                <Layer listening={toolMode === "select"}>
                    {rooms.map(room => (
                        <Line key={room.id} points={room.polygon.flatMap(p => [p.x, p.y])} closed
                            fill="rgba(248,180,0,0.10)" stroke="rgba(124,88,0,0.18)" strokeWidth={2} lineJoin="round"
                            onClick={e => { e.cancelBubble = true; setSelectedWallIds(new Set()); }}
                        />
                    ))}
                </Layer>

                {/* ── Room area labels ───────────────────────────────────────── */}
                <Layer listening={false}>
                    {stageScale >= DIM_HIDE_BELOW && rooms.map(room => {
                        const fs  = ss(11);
                        const pw  = ss(4);
                        const sw  = ss(0.5);
                        const cr  = ss(3);
                        const lblW = room.label.length * fs * 0.62 + pw * 2;
                        const lblH = fs * 1.4 + pw;
                        return (
                            <Group key={`area-${room.id}`}>
                                <Rect
                                    x={room.centroidX} y={room.centroidY}
                                    width={lblW} height={lblH}
                                    offsetX={lblW / 2} offsetY={lblH / 2}
                                    fill="rgba(253,249,240,0.88)"
                                    stroke="rgba(124,88,0,0.22)" strokeWidth={sw}
                                    cornerRadius={cr}
                                />
                                <Text
                                    x={room.centroidX} y={room.centroidY}
                                    text={room.label}
                                    fontSize={fs}
                                    fontFamily="'Nunito Sans', sans-serif"
                                    fontStyle="bold"
                                    fill="#7c5800"
                                    width={lblW} height={lblH}
                                    align="center" verticalAlign="middle"
                                    offsetX={lblW / 2} offsetY={lblH / 2}
                                />
                            </Group>
                        );
                    })}
                </Layer>

                {/* ── Wall outlines (non-interactive stroke) ─────────────────── */}
                <Layer listening={false}>
                    {caps.map(cap => (
                        <Line key={`cap-outline-${cap.nodeId}`} points={cap.polygon.flatMap(p => [p.x, p.y])} closed
                            stroke="#504532" strokeWidth={3} lineJoin="round" />
                    ))}
                    {walls.map(wall => wall.polygon
                        ? <Line key={`outline-${wall.id}`} points={wall.polygon.flatMap(p => [p.x, p.y])} closed stroke="#504532" strokeWidth={3} lineJoin="round" />
                        : <Line key={`outline-${wall.id}`} points={[wall.cx, wall.cy, wall.cx, wall.cy]} stroke="#504532" strokeWidth={3} />
                    )}
                </Layer>

                {/* ── Wall fills + tool-delegated handlers ───────────────────── */}
                <Layer listening={toolMode === "select"}>
                    {caps.map(cap => (
                        <Line key={`cap-fill-${cap.nodeId}`} points={cap.polygon.flatMap(p => [p.x, p.y])} closed
                            fill="#d5c4ac" stroke="#d5c4ac" strokeWidth={1} lineJoin="miter" listening={false} />
                    ))}

                    {walls.map(wall => {
                        if (!wall.polygon) return null;
                        const { fill, stroke, draggable, ...handlers } = activeTool.getWallProps(wall);
                        return (
                            <Line
                                key={`fill-${wall.id}`}
                                points={wall.polygon.flatMap(p => [p.x, p.y])}
                                closed
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={1}
                                lineJoin="miter"
                                draggable={draggable}
                                {...handlers}
                            />
                        );
                    })}
                </Layer>

                {/* ── Dimension annotations ──────────────────────────────────── */}
                <Layer listening={false}>
                    {stageScale >= DIM_HIDE_BELOW && dimensions.filter(d => d.length >= MIN_DIM_LENGTH_M).map(dim => {
                        const ox = dim.perpX * DIM_OFFSET;
                        const oy = dim.perpY * DIM_OFFSET;
                        const x1 = dim.startX + ox, y1 = dim.startY + oy;
                        const x2 = dim.endX   + ox, y2 = dim.endY   + oy;
                        let angleDeg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
                        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
                        const mx = (x1 + x2) / 2;
                        const my = (y1 + y2) / 2;
                        const extGap = ss(5);
                        const extOver = ss(5);
                        const lblW = Math.max(ss(54), dim.label.length * ss(7));
                        const lblH = ss(14);
                        return (
                            <Group key={`dim-${dim.wallId}`}>
                                <Line points={[dim.startX + dim.perpX * extGap, dim.startY + dim.perpY * extGap, x1 + dim.perpX * extOver, y1 + dim.perpY * extOver]}
                                    stroke="#a89880" strokeWidth={ss(0.8)} />
                                <Line points={[dim.endX + dim.perpX * extGap, dim.endY + dim.perpY * extGap, x2 + dim.perpX * extOver, y2 + dim.perpY * extOver]}
                                    stroke="#a89880" strokeWidth={ss(0.8)} />
                                <Line points={[x1, y1, x2, y2]} stroke="#7c6a55" strokeWidth={ss(1)} />
                                <Circle x={x1} y={y1} radius={ss(2)} fill="#7c6a55" />
                                <Circle x={x2} y={y2} radius={ss(2)} fill="#7c6a55" />
                                <Rect x={mx} y={my} width={lblW} height={lblH} offsetX={lblW / 2} offsetY={lblH / 2}
                                    rotation={angleDeg} fill="#f7f3ea" cornerRadius={ss(2)} />
                                <Text x={mx} y={my} text={dim.label} fontSize={ss(10)}
                                    fontFamily="'Nunito Sans', sans-serif" fill="#504532"
                                    width={lblW} height={lblH} align="center" verticalAlign="middle"
                                    offsetX={lblW / 2} offsetY={lblH / 2} rotation={angleDeg} />
                            </Group>
                        );
                    })}
                </Layer>

                {/* ── Angle arc annotations ──────────────────────────────────── */}
                <Layer listening={false}>
                    {stageScale >= ANGLE_HIDE_BELOW && angleDimensions.map((adim, i) => {
                        const arcR = ss(ANGLE_ARC_RADIUS);
                        const lx = adim.cx + adim.bisectorX * (arcR + ss(14));
                        const ly = adim.cy + adim.bisectorY * (arcR + ss(14));
                        const lw = ss(36);
                        const lh = ss(14);
                        return (
                            <Group key={`adim-${adim.nodeId}-${i}`}>
                                <Arc x={adim.cx} y={adim.cy}
                                    innerRadius={0} outerRadius={arcR}
                                    rotation={adim.startAngleDeg} angle={adim.sweepAngleDeg}
                                    fill="rgba(100,149,237,0.12)" stroke="#6495ed" strokeWidth={ss(1)} />
                                <Text x={lx} y={ly} text={adim.label}
                                    fontSize={ss(10)} fontFamily="'Nunito Sans', sans-serif" fill="#3a5aad"
                                    width={lw} height={lh} align="center" verticalAlign="middle"
                                    offsetX={lw / 2} offsetY={lh / 2} />
                            </Group>
                        );
                    })}
                </Layer>

                {/* ── Active tool overlay (handles, preview, highlights) ──────── */}
                {activeTool.renderOverlay()}

                {/* ── Axes (always on top) ───────────────────────────────────── */}
                <Layer listening={false}>
                    <Arrow points={[originX, originY, originX + 60, originY]} pointerLength={10} pointerWidth={8} fill="#ba1a1a" stroke="#ba1a1a" strokeWidth={2} />
                    <Text x={originX + 64} y={originY - 7} text="X" fill="#ba1a1a" fontSize={13} fontStyle="bold" />
                    <Arrow points={[originX, originY, originX, originY + 60]} pointerLength={10} pointerWidth={8} fill="#496640" stroke="#496640" strokeWidth={2} />
                    <Text x={originX + 6} y={originY + 64} text="Z" fill="#496640" fontSize={13} fontStyle="bold" />
                    <Circle x={originX} y={originY} radius={4} fill="#837560" />
                    <Text x={originX + 6} y={originY - 16} text="O" fill="#837560" fontSize={11} />
                </Layer>
            </Stage>

            {/* Wall properties panel */}
            {toolMode === "select" && selectedWallIds.size > 0 && (
                <WallPropertiesPanel
                    wallIds={selectedWallIds}
                    initialThickness={singleSelectedWall ? Math.round(singleSelectedWall.thickness * 1000) : undefined}
                    initialHeight={singleSelectedWall ? Math.round(singleSelectedWall.height * 1000) : undefined}
                    onApply={(thickness, height) => {
                        withTransaction("update wall properties", () => {
                            for (const id of selectedWallIds) {
                                dispatch({ type: "UPDATE_WALL", wallId: id, thickness, height });
                            }
                        });
                    }}
                />
            )}
        </div>
    );
}
