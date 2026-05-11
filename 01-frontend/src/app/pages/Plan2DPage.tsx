import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Layer, Line, Stage, Circle, Text } from "react-konva";

import { useFloorPlanStore, type Node2D, type Wall2D } from "src/app/store/useFloorPlanStore";
import { useUIStore } from "src/app/store/useUIStore";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

// ============================================================
// Constants
// ============================================================

const GRID_SIZE = 20;
const WALL_THICKNESS = 20;          // px ≈ 1 world unit
const PX_PER_WORLD = 20;
const SNAP_RADIUS = 20;          // px — snap to existing node
const MIN_WALL_PX = 10;

// ============================================================
// Types
// ============================================================

type Px = { x: number; y: number };

// ============================================================
// Pure helpers
// ============================================================

function toWorldX(px: number, originX: number) { return (px - originX) / PX_PER_WORLD; }
function toWorldZ(py: number, originY: number) { return (py - originY) / PX_PER_WORLD; }

function dispatch(cmd: EngineCommand) {
    if (!window.gameEngine) {
        console.warn("[Plan2D] dispatch called before engine init:", cmd.type);
        return;
    }
    window.gameEngine.api.dispatch(cmd);
}

function snapToNodeOrGrid(
    raw: Px,
    nodes: Node2D[],
    walls: Wall2D[],
    originX: number,
    originY: number,
    excludeNodeId?: number,
): { pos: Px; snappedNodeId: number | null; snappedWallId: number | null } {
    let bestNode: Node2D | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
        if (n.id === excludeNodeId) continue;
        const d = Math.hypot(raw.x - n.x, raw.y - n.y);
        if (d < SNAP_RADIUS && d < bestDist) { bestDist = d; bestNode = n; }
    }
    if (bestNode) return { pos: { x: bestNode.x, y: bestNode.y }, snappedNodeId: bestNode.id, snappedWallId: null };

    // 2. Segment (edge) snapping
    let bestWallId: number | null = null;
    let bestWallPos: Px | null = null;
    let bestWallDist = Infinity;

    for (const w of walls) {
        const start = nodes.find(n => n.id === w.startNodeId);
        const end = nodes.find(n => n.id === w.endNodeId);
        if (!start || !end) continue;
        if (start.id === excludeNodeId || end.id === excludeNodeId) continue; // Don't snap to wall you are drawing from

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;

        // Project raw point onto the line segment
        let t = ((raw.x - start.x) * dx + (raw.y - start.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t)); // Clamp to endpoints

        const projX = start.x + t * dx;
        const projY = start.y + t * dy;

        const dist = Math.hypot(raw.x - projX, raw.y - projY);
        if (dist < SNAP_RADIUS && dist < bestWallDist) {
            bestWallDist = dist;
            bestWallPos = { x: projX, y: projY };
            bestWallId = w.id;
        }
    }

    if (bestWallPos && bestWallId !== null) {
        return { pos: bestWallPos, snappedNodeId: null, snappedWallId: bestWallId };
    }

    // Snap to grid relative to World Origin, not screen (0,0)
    const snapWorldPx = (px: number, origin: number) => {
        const world = (px - origin) / PX_PER_WORLD;
        return Math.round(world) * PX_PER_WORLD + origin;
    };

    return {
        pos: { x: snapWorldPx(raw.x, originX), y: snapWorldPx(raw.y, originY) },
        snappedNodeId: null,
        snappedWallId: null
    };
}

// ============================================================
// Component
// ============================================================

export default function Plan2DPage() {
    const viewportWidth = useUIStore(s => s.viewportWidth);
    const viewportHeight = useUIStore(s => s.viewportHeight);

    const { nodes, walls, caps, rooms } = useFloorPlanStore(viewportWidth, viewportHeight);

    const originX = viewportWidth / 2;
    const originY = viewportHeight / 2;

    // ── Stable ID counters — survive remount by reading engine state ──
    const nodeIdRef = useRef<number>(-1);
    const wallIdRef = useRef<number>(-1);
    if (nodeIdRef.current === -1) {
        // Initialize from engine on first render (or after remount/hot-reload)
        const ids = window.gameEngine?.api.getNextIds();
        nodeIdRef.current = ids?.nodeId ?? 100;
        wallIdRef.current = ids?.wallId ?? 50;
    }
    function nextNodeId() { return nodeIdRef.current++; }
    function nextWallId() { return wallIdRef.current++; }

    type ToolMode = "select" | "draw";
    const [toolMode, setToolMode] = useState<ToolMode>("select");
    const [selectedWallId, setSelectedWallId] = useState<number | null>(null);

    const [drawState, setDrawState] = useState<{ startNodeId: number; startPos: Px } | null>(null);
    const mousePosRef = useRef<Px | null>(null);
    const previewLineRef = useRef<any>(null);

    const nodeDragOrigin = useRef<Map<number, { wx: number; wz: number }>>(new Map());

    const wallDragOrigin = useRef<{
        startX: number, startY: number, 
        endX: number, endY: number,
        startNodeId: number, endNodeId: number,
        pointerStartX: number, pointerStartY: number
    } | null>(null);

    const selectedWall = useMemo(
        () => walls.find(w => w.id === selectedWallId) ?? null,
        [walls, selectedWallId],
    );

    const nodeById = useMemo(() => {
        const m = new Map<number, Node2D>();
        for (const n of nodes) m.set(n.id, n);
        return m;
    }, [nodes]);

    // ── Keyboard ─────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.key === "Delete" || e.key === "Backspace") && selectedWallId !== null) {
                dispatch({ type: "REMOVE_WALL", wallId: selectedWallId });
                setSelectedWallId(null);
            }
            if (e.key === "Escape") {
                setDrawState(null);
                mousePosRef.current = null;
                if (toolMode === "draw") setToolMode("select");
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selectedWallId, toolMode]);

    // ── Derived UI ────────────────────────────────────────────
    const selectedWallNodes = useMemo(() => {
        if (!selectedWall) return null;
        const sn = nodeById.get(selectedWall.startNodeId);
        const en = nodeById.get(selectedWall.endNodeId);
        return sn && en ? { start: sn, end: en } : null;
    }, [selectedWall, nodeById]);

    // ============================================================
    // Render
    // ============================================================
    return (
        <div style={{ width: "100vw", height: "100vh", background: "#020617" }}>

            {/* Info bar */}
            <div style={{
                position: "absolute", top: 12, left: 12, zIndex: 10,
                color: "#e2e8f0", background: "rgba(15,23,42,0.85)",
                border: "1px solid #334155", borderRadius: 8,
                padding: "8px 12px", fontSize: 12, fontFamily: "monospace",
            }}>
                Plan 2D · {nodes.length} nodes · {walls.length} walls
                {selectedWall ? ` | Wall #${selectedWall.id}` : ""}
            </div>

            {/* Toolbar */}
            <div style={{ position: "absolute", top: 52, left: 12, zIndex: 10, display: "flex", gap: 8 }}>
                {(["select", "draw"] as const).map(tool => (
                    <button
                        key={tool}
                        type="button"
                        onClick={() => {
                            setToolMode(tool);
                            setDrawState(null);
                            mousePosRef.current = null;
                            if (tool === "draw") setSelectedWallId(null);
                        }}
                        style={{
                            background: toolMode === tool ? "#38bdf8" : "#334155",
                            color: toolMode === tool ? "#0f172a" : "#e2e8f0",
                            border: "none", borderRadius: 8,
                            padding: "8px 14px", fontSize: 12,
                            fontWeight: 600, cursor: "pointer",
                        }}
                    >
                        {tool === "select" ? "Select" : "Draw Wall"}
                    </button>
                ))}
            </div>

            {/* Konva Stage */}
            <Stage
                width={viewportWidth}
                height={viewportHeight}
                style={{
                    display: "block",
                    backgroundColor: "#0f172a",
                    backgroundImage: `linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)`,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                    backgroundPosition: `${originX}px ${originY}px`,
                    cursor: toolMode === "draw" ? "crosshair" : "default",
                }}

                onMouseDown={e => {
                    // In select mode, clicking empty space deselects
                    if (toolMode === "select" && e.target === e.target.getStage()) {
                        setSelectedWallId(null);
                    }
                }}

                onMouseMove={e => {
                    if (toolMode !== "draw") return;
                    const ptr = e.target.getStage()?.getPointerPosition();
                    if (!ptr) return;
                    const { pos } = snapToNodeOrGrid(ptr, nodes, walls, originX, originY, drawState?.startNodeId);
                    mousePosRef.current = pos;
                    if (previewLineRef.current && drawState) {
                        previewLineRef.current.points([drawState.startPos.x, drawState.startPos.y, pos.x, pos.y]);
                    }
                }}

                onClick={e => {
                    if (toolMode !== "draw" || e.evt.button !== 0) return;
                    const ptr = e.target.getStage()?.getPointerPosition();
                    if (!ptr) return;

                    const { pos, snappedNodeId, snappedWallId } = snapToNodeOrGrid(ptr, nodes, walls, originX, originY, drawState?.startNodeId);

                    if (!drawState) {
                        // First click: create or reuse start node
                        let nodeId: number;
                        if (snappedNodeId !== null) {
                            nodeId = snappedNodeId;
                        } else if (snappedWallId !== null) {
                            nodeId = nextNodeId();
                            dispatch({
                                type: "SPLIT_WALL",
                                originalWallId: snappedWallId,
                                newWallId: nextWallId(),
                                newNodeId: nodeId,
                                x: toWorldX(pos.x, originX),
                                z: toWorldZ(pos.y, originY),
                            });
                        } else {
                            nodeId = nextNodeId();
                            dispatch({ type: "ENSURE_NODE", nodeId, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
                        }
                        setDrawState({ startNodeId: nodeId, startPos: pos });
                        return;
                    }

                    // Second click: commit wall
                    const len = Math.hypot(pos.x - drawState.startPos.x, pos.y - drawState.startPos.y);
                    if (len < MIN_WALL_PX) return;

                    let endNodeId: number;
                    if (snappedNodeId !== null) {
                        endNodeId = snappedNodeId;
                    } else if (snappedWallId !== null) {
                        endNodeId = nextNodeId();
                        dispatch({
                            type: "SPLIT_WALL",
                            originalWallId: snappedWallId,
                            newWallId: nextWallId(),
                            newNodeId: endNodeId,
                            x: toWorldX(pos.x, originX),
                            z: toWorldZ(pos.y, originY),
                        });
                    } else {
                        endNodeId = nextNodeId();
                        dispatch({ type: "ENSURE_NODE", nodeId: endNodeId, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
                    }

                    const newWallId = nextWallId();
                    dispatch({
                        type: "ADD_WALL",
                        wallId: newWallId,
                        startNodeId: drawState.startNodeId,
                        endNodeId,
                        thickness: Math.max(0.01, WALL_THICKNESS / PX_PER_WORLD),
                    });

                    dispatch({
                        type: "RESOLVE_INTERSECTIONS",
                        wallId: newWallId,
                    });

                    // Chain drawing from the end node
                    setDrawState({ startNodeId: endNodeId, startPos: pos });
                }}

                onContextMenu={e => {
                    e.evt.preventDefault();
                    setDrawState(null);
                    mousePosRef.current = null;
                }}
            >
                {/* Layer 1.5: Floor fills (Rooms) */}
                <Layer listening={toolMode === "select"}>
                    {rooms.map(room => (
                        <Line
                            key={room.id}
                            points={room.polygon.flatMap(p => [p.x, p.y])}
                            closed
                            fill="#e2e8f0"
                            stroke="#cbd5e1"
                            strokeWidth={2}
                            lineJoin="round"
                            onClick={(e) => {
                                // Prevent background clicks when clicking a floor
                                e.cancelBubble = true;
                                setSelectedWallId(null);
                            }}
                        />
                    ))}
                </Layer>

                {/* Layer 2: Wall outlines + cap outlines (non-interactive) */}
                <Layer listening={false}>
                    {caps.map(cap => (
                        <Line
                            key={`cap-outline-${cap.nodeId}`}
                            points={cap.polygon.flatMap(p => [p.x, p.y])}
                            closed
                            stroke="#475569"
                            strokeWidth={4}
                            lineJoin="round"
                        />
                    ))}
                    {walls.map(wall => {
                        if (wall.polygon) {
                            return (
                                <Line
                                    key={`outline-${wall.id}`}
                                    points={wall.polygon.flatMap(p => [p.x, p.y])}
                                    closed
                                    stroke="#475569"
                                    strokeWidth={4}
                                    lineJoin="round"
                                />
                            );
                        }
                        return (
                            <Line key={`outline-${wall.id}`} points={[wall.cx, wall.cy, wall.cx, wall.cy]}
                                stroke="#475569" strokeWidth={4} />
                        );
                    })}
                </Layer>

                {/* Layer 3: Wall fills + cap fills — interactive ONLY in select mode */}
                <Layer listening={toolMode === "select"}>
                    {caps.map(cap => (
                        <Line
                            key={`cap-fill-${cap.nodeId}`}
                            points={cap.polygon.flatMap(p => [p.x, p.y])}
                            closed
                            fill="#94a3b8"
                            stroke="#94a3b8"
                            strokeWidth={1}
                            lineJoin="miter"
                            listening={false}
                        />
                    ))}
                    {walls.map(wall => {
                        if (wall.polygon) {
                            return (
                                <Line
                                    key={`fill-${wall.id}`}
                                    points={wall.polygon.flatMap(p => [p.x, p.y])}
                                    closed
                                    fill="#94a3b8"
                                    stroke="#94a3b8"
                                    strokeWidth={1}
                                    lineJoin="miter"
                                    onMouseDown={() => setSelectedWallId(wall.id)}
                                    onTap={() => setSelectedWallId(wall.id)}
                                    draggable={toolMode === "select"}
                                    onDragStart={(e) => {
                                        setSelectedWallId(wall.id);
                                        const ptr = e.target.getStage()?.getPointerPosition();
                                        const sn = nodeById.get(wall.startNodeId);
                                        const en = nodeById.get(wall.endNodeId);
                                        if (!ptr || !sn || !en) return;
                                        
                                        wallDragOrigin.current = {
                                            startX: sn.x, startY: sn.y,
                                            endX: en.x, endY: en.y,
                                            startNodeId: sn.id, endNodeId: en.id,
                                            pointerStartX: ptr.x, pointerStartY: ptr.y
                                        };
                                    }}
                                    onDragMove={(e) => {
                                        const origin = wallDragOrigin.current;
                                        const ptr = e.target.getStage()?.getPointerPosition();
                                        if (!origin || !ptr) return;
                                        
                                        // Reset Konva node offset so we only drive from ECS state
                                        e.target.x(0);
                                        e.target.y(0);
                                        
                                        const dx = ptr.x - origin.pointerStartX;
                                        const dy = ptr.y - origin.pointerStartY;
                                        
                                        const rawStartX = origin.startX + dx;
                                        const rawStartY = origin.startY + dy;
                                        
                                        // Snap start node to preserve rigid translation aligned to grid
                                        const { pos: snappedStart } = snapToNodeOrGrid({ x: rawStartX, y: rawStartY }, nodes, walls, originX, originY, origin.startNodeId);
                                        
                                        const actualDx = snappedStart.x - origin.startX;
                                        const actualDy = snappedStart.y - origin.startY;
                                        
                                        const newEndX = origin.endX + actualDx;
                                        const newEndY = origin.endY + actualDy;

                                        dispatch({
                                            type: "MOVE_NODE",
                                            nodeId: origin.startNodeId,
                                            x: toWorldX(snappedStart.x, originX),
                                            z: toWorldZ(snappedStart.y, originY)
                                        });
                                        dispatch({
                                            type: "MOVE_NODE",
                                            nodeId: origin.endNodeId,
                                            x: toWorldX(newEndX, originX),
                                            z: toWorldZ(newEndY, originY)
                                        });
                                    }}
                                    onDragEnd={(e) => {
                                        wallDragOrigin.current = null;
                                        e.target.x(0);
                                        e.target.y(0);
                                        dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: wall.id });
                                    }}
                                />
                            );
                        }
                        return null;
                    })}

                    {/* Logical Segment Selection Highlight */}
                    {toolMode === "select" && selectedWall && selectedWallNodes && (
                        <>
                            {/* Highlight Outline (Halo) */}
                            <Line
                                points={[
                                    selectedWallNodes.start.x, selectedWallNodes.start.y,
                                    selectedWallNodes.end.x, selectedWallNodes.end.y
                                ]}
                                stroke="#bae6fd"
                                strokeWidth={WALL_THICKNESS + 4}
                                lineCap="round"
                                listening={false}
                            />
                            {/* Highlight Fill */}
                            <Line
                                points={[
                                    selectedWallNodes.start.x, selectedWallNodes.start.y,
                                    selectedWallNodes.end.x, selectedWallNodes.end.y
                                ]}
                                stroke="#38bdf8"
                                strokeWidth={WALL_THICKNESS}
                                lineCap="round"
                                listening={false}
                            />
                        </>
                    )}

                    {/* Node handles — only in select mode */}
                    {toolMode === "select" && selectedWall && selectedWallNodes && (() => {
                        const renderHandle = (node: Node2D, isStart: boolean) => (
                            <Circle
                                key={`handle-${isStart ? "s" : "e"}-${node.id}`}
                                x={node.x}
                                y={node.y}
                                radius={9}
                                fill="#ffffff"
                                stroke="#0ea5e9"
                                strokeWidth={3}
                                draggable
                                dragBoundFunc={(pos) => {
                                    const { pos: snappedPos } = snapToNodeOrGrid(pos, nodes, walls, originX, originY, node.id);
                                    return snappedPos;
                                }}
                                onDragStart={() => {
                                    nodeDragOrigin.current.set(node.id, {
                                        wx: toWorldX(node.x, originX),
                                        wz: toWorldZ(node.y, originY),
                                    });
                                }}
                                onDragMove={ev => {
                                    dispatch({
                                        type: "MOVE_NODE",
                                        nodeId: node.id,
                                        x: toWorldX(ev.target.x(), originX),
                                        z: toWorldZ(ev.target.y(), originY),
                                    });
                                }}
                                onDragEnd={ev => {
                                    const raw = { x: ev.target.x(), y: ev.target.y() };
                                    const { pos, snappedNodeId, snappedWallId } = snapToNodeOrGrid(raw, nodes, walls, originX, originY, node.id);

                                    if (snappedNodeId !== null) {
                                        dispatch({ type: "MERGE_NODE", sourceNodeId: node.id, targetNodeId: snappedNodeId });
                                        setSelectedWallId(null);
                                    } else if (snappedWallId !== null) {
                                        // We dragged a node onto a wall! Split the wall at the snapped pos.
                                        dispatch({
                                            type: "SPLIT_WALL",
                                            originalWallId: snappedWallId,
                                            newWallId: nextWallId(),
                                            newNodeId: node.id,
                                            x: toWorldX(pos.x, originX),
                                            z: toWorldZ(pos.y, originY),
                                        });
                                    } else {
                                        dispatch({
                                            type: "MOVE_NODE",
                                            nodeId: node.id,
                                            x: toWorldX(pos.x, originX),
                                            z: toWorldZ(pos.y, originY),
                                        });
                                    }
                                    dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: selectedWall.id });
                                    nodeDragOrigin.current.delete(node.id);
                                }}
                                onMouseEnter={ev => {
                                    const c = ev.target.getStage()?.container();
                                    if (c) c.style.cursor = "crosshair";
                                }}
                                onMouseLeave={ev => {
                                    const c = ev.target.getStage()?.container();
                                    if (c) c.style.cursor = "default";
                                }}
                            />
                        );
                        return (
                            <>
                                {renderHandle(selectedWallNodes.start, true)}
                                {renderHandle(selectedWallNodes.end, false)}
                            </>
                        );
                    })()}
                </Layer>

                {/* Layer 4: Draw preview */}
                <Layer listening={false}>
                    {drawState && (
                        <Line
                            ref={previewLineRef}
                            points={[drawState.startPos.x, drawState.startPos.y, mousePosRef.current?.x ?? drawState.startPos.x, mousePosRef.current?.y ?? drawState.startPos.y]}
                            stroke="#38bdf8"
                            strokeWidth={WALL_THICKNESS}
                            opacity={0.35}
                            lineCap="square"
                        />
                    )}
                    {drawState && (
                        <Circle x={drawState.startPos.x} y={drawState.startPos.y} radius={6} fill="#38bdf8" />
                    )}
                </Layer>

                {/* Layer 5: All nodes (visible in draw mode for snap guidance) */}
                {toolMode === "draw" && (
                    <Layer listening={false}>
                        {nodes.map(n => (
                            <Circle
                                key={`node-${n.id}`}
                                x={n.x} y={n.y} radius={5}
                                fill="#64748b" stroke="#94a3b8" strokeWidth={1.5}
                            />
                        ))}
                    </Layer>
                )}

                {/* Layer 6.5: Coordinate Axes (X = Red/Right, Z = Green/Down) */}
                <Layer listening={false}>
                    {/* X Axis (world +X = screen right, màu đỏ) */}
                    <Arrow
                        points={[originX, originY, originX + 60, originY]}
                        pointerLength={10} pointerWidth={8}
                        fill="#ef4444" stroke="#ef4444" strokeWidth={2}
                    />
                    <Text x={originX + 64} y={originY - 7} text="X" fill="#ef4444" fontSize={13} fontStyle="bold" />

                    {/* Z Axis (world +Z = screen down, màu xanh lá) */}
                    <Arrow
                        points={[originX, originY, originX, originY + 60]}
                        pointerLength={10} pointerWidth={8}
                        fill="#22c55e" stroke="#22c55e" strokeWidth={2}
                    />
                    <Text x={originX + 6} y={originY + 64} text="Z" fill="#22c55e" fontSize={13} fontStyle="bold" />

                    {/* Origin dot */}
                    <Circle x={originX} y={originY} radius={4} fill="#94a3b8" />
                    <Text x={originX + 6} y={originY - 16} text="O" fill="#94a3b8" fontSize={11} />
                </Layer>

                {/* Layer 7: Labels */}
                <Layer listening={false}>
                    {selectedWall && (
                        <Text
                            x={selectedWall.cx - 30}
                            y={selectedWall.cy - 20}
                            text={`Wall #${selectedWall.id}`}
                            fill="#e2e8f0"
                            fontSize={12}
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
}
