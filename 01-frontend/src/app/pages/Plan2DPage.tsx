import { useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Layer, Line, Rect, Stage, Text, Circle } from "react-konva";

import { useWallStore, type Wall2D } from "@/app/store/useWallStore";
import { useUIStore } from "@/app/store/useUIStore";
import type { EngineCommand } from "@/engine/commands/EngineCommands";

// ============================================================
// Constants
// ============================================================

const GRID_SIZE = 20;
const WALL_THICKNESS = 20; // px
const PX_PER_WORLD = 20;
const WALL_JOINT_SNAP_DIST = 20; // px
const MIN_WALL_LENGTH = 10; // px

// ============================================================
// Types
// ============================================================

type Point2D = { x: number; y: number };

// ============================================================
// Pure helpers (no React)
// ============================================================

function snap(value: number, step: number) {
    return Math.round(value / step) * step;
}

function getWallEndpoints(wall: Wall2D) {
    const angle = (wall.rotation * Math.PI) / 180;
    const logicalWidth = Math.max(0, wall.w - wall.h);
    const half = logicalWidth / 2;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    return [
        { x: wall.x - dx, y: wall.y - dy },
        { x: wall.x + dx, y: wall.y + dy },
    ];
}

function getSnappedPosition(pos: Point2D, gridSize: number, walls: Wall2D[], excludeWallId: number | null = null): Point2D {
    for (const wall of walls) {
        if (wall.id === excludeWallId) continue;
        for (const pt of getWallEndpoints(wall)) {
            if (Math.hypot(pos.x - pt.x, pos.y - pt.y) < WALL_JOINT_SNAP_DIST) {
                return pt;
            }
        }
    }
    return { x: snap(pos.x, gridSize), y: snap(pos.y, gridSize) };
}

/** Fire-and-forget command vào ECS */
function dispatch(command: EngineCommand) {
    window.gameEngine?.api.dispatch(command);
}

/** Pixel → world X */
function toWorldX(px: number, originX: number) {
    return (px - originX) / PX_PER_WORLD;
}

/** Pixel → world Z (Konva Y ↔ Three Z) */
function toWorldZ(py: number, originY: number) {
    return (py - originY) / PX_PER_WORLD;
}

/**
 * Hỏi Rapier/Cannon: "tường có thể đến vị trí này không?"
 * Phải synchronous vì dùng trong dragBoundFunc của Konva.
 */
function clampDragPos(
    wallId: number,
    pos: Point2D,
    vpW: number,
    vpH: number,
): Point2D {
    const nextX = snap(pos.x, GRID_SIZE);
    const nextY = snap(pos.y, GRID_SIZE);

    const clamp = window.gameEngine?.api.clampMovement2D;
    if (!clamp) return { x: nextX, y: nextY };

    const originX = vpW / 2;
    const originY = vpH / 2;
    const safe = clamp(wallId, toWorldX(nextX, originX), toWorldZ(nextY, originY));

    return {
        x: safe.x * PX_PER_WORLD + originX,
        y: safe.z * PX_PER_WORLD + originY,
    };
}

// ============================================================
// Component
// ============================================================

export default function Plan2DPage() {
    // ── Data từ ECS (qua snapshot) ────────────────────────────
    const walls = useWallStore();

    // ── UI state từ UIStore ───────────────────────────────────
    const viewportWidth = useUIStore((s) => s.viewportWidth);
    const viewportHeight = useUIStore((s) => s.viewportHeight);
    const getAndIncrementNextWallId = useUIStore((s) => s.getAndIncrementNextWallId);

    // ── Local interaction state ───────────────────────────────
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [toolMode, setToolMode] = useState<"select" | "draw">("select");
    const [drawStartPoint, setDrawStartPoint] = useState<Point2D | null>(null);
    const [mousePos, setMousePos] = useState<Point2D | null>(null);

    // Refs for drag state
    const p1SafePos = useRef<Point2D | null>(null);
    const p2SafePos = useRef<Point2D | null>(null);

    // Pre-compute các giá trị hay dùng
    const originX = viewportWidth / 2;
    const originY = viewportHeight / 2;

    // ── Derived state ─────────────────────────────────────────
    const selectedWall = useMemo(
        () => walls.find((w) => w.id === selectedId) ?? null,
        [walls, selectedId],
    );

    const activeEndpoints = useMemo(() => {
        if (!selectedWall) return null;
        return getWallEndpoints(selectedWall);
    }, [selectedWall]);

    // ── Keyboard: Delete/Backspace xóa tường đang chọn ───────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== null) {
                dispatch({ type: "REMOVE_WALL", wallId: selectedId });
                setSelectedId(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedId]);

    // ── Grid lines (chỉ tính lại khi viewport thay đổi) ─────
    const gridLinesLayer = useMemo(() => {
        const lines: { key: string; points: number[] }[] = [];
        for (let x = 0; x <= viewportWidth; x += GRID_SIZE)
            lines.push({ key: `v${x}`, points: [x, 0, x, viewportHeight] });
        for (let y = 0; y <= viewportHeight; y += GRID_SIZE)
            lines.push({ key: `h${y}`, points: [0, y, viewportWidth, y] });
        return (
            <Layer listening={false}>
                {lines.map((l) => (
                    <Line key={l.key} points={l.points} stroke="#1e293b" strokeWidth={1} />
                ))}
            </Layer>
        );
    }, [viewportWidth, viewportHeight]);

    // ── Preview wall trong draw mode ──────────────────────────
    const previewWall =
        toolMode === "draw" && drawStartPoint && mousePos
            ? {
                centerX: (drawStartPoint.x + mousePos.x) / 2,
                centerY: (drawStartPoint.y + mousePos.y) / 2,
                width: Math.hypot(mousePos.x - drawStartPoint.x, mousePos.y - drawStartPoint.y) + WALL_THICKNESS,
                rotation: (Math.atan2(mousePos.y - drawStartPoint.y, mousePos.x - drawStartPoint.x) * 180) / Math.PI,
            }
            : null;

    // ============================================================
    // Render
    // ============================================================
    return (
        <div style={{ width: "100vw", height: "100vh", background: "#020617" }}>

            {/* ── Info bar ── */}
            <div style={{
                position: "absolute", top: 12, left: 12, zIndex: 10,
                color: "#e2e8f0", background: "rgba(15,23,42,0.85)",
                border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 12,
            }}>
                Plan 2D · {GRID_SIZE}px snap
                {selectedWall
                    ? ` | #${selectedWall.id}  pos(${selectedWall.x.toFixed(0)}, ${selectedWall.y.toFixed(0)})  rot(${Math.round(selectedWall.rotation)}°)`
                    : ""}
            </div>

            {/* ── Toolbar ── */}
            <div style={{ position: "absolute", top: 52, left: 12, zIndex: 10, display: "flex", gap: 8 }}>
                {(["select", "draw"] as const).map((tool) => (
                    <button
                        key={tool}
                        type="button"
                        onClick={() => {
                            setToolMode(tool);
                            setDrawStartPoint(null);
                            if (tool === "draw") setSelectedId(null);
                        }}
                        style={{
                            background: toolMode === tool ? "#38bdf8" : "#334155",
                            color: toolMode === tool ? "#0f172a" : "#e2e8f0",
                            border: "none", borderRadius: 8,
                            padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                    >
                        {tool === "select" ? "Select" : "Draw Wall"}
                    </button>
                ))}
            </div>

            {/* ── Konva Stage ── */}
            <Stage
                width={viewportWidth}
                height={viewportHeight}
                style={{ display: "block", background: "#0f172a", cursor: toolMode === "draw" ? "crosshair" : "default" }}

                onMouseDown={(e) => {
                    if (toolMode === "select" && e.target === e.target.getStage()) setSelectedId(null);
                }}

                onClick={(e) => {
                    if (toolMode !== "draw" || e.evt.button !== 0) return;

                    const ptr = e.target.getStage()?.getPointerPosition();
                    if (!ptr) return;

                    const nextPt = getSnappedPosition(ptr, GRID_SIZE, walls);

                    if (!drawStartPoint) {
                        setDrawStartPoint(nextPt);
                        return;
                    }

                    // Confirm segment
                    const dx = nextPt.x - drawStartPoint.x;
                    const dy = nextPt.y - drawStartPoint.y;
                    const len = Math.hypot(dx, dy);
                    if (len < MIN_WALL_LENGTH) return;

                    const width = len + WALL_THICKNESS;
                    const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const cx = (drawStartPoint.x + nextPt.x) / 2;
                    const cy = (drawStartPoint.y + nextPt.y) / 2;

                    // ← dispatch ADD_WALL vào ECS
                    dispatch({
                        type: "ADD_WALL",
                        wallId: getAndIncrementNextWallId(),
                        x: toWorldX(cx, originX),
                        z: toWorldZ(cy, originY),
                        w: Math.max(0.01, width / PX_PER_WORLD),
                        d: Math.max(0.01, WALL_THICKNESS / PX_PER_WORLD),
                        rotY: -(rotation * Math.PI) / 180,
                    });

                    setDrawStartPoint(nextPt); // tiếp tục vẽ từ điểm vừa bấm
                }}

                onMouseMove={(e) => {
                    if (toolMode !== "draw") return;
                    const ptr = e.target.getStage()?.getPointerPosition();
                    if (!ptr) return;
                    
                    const newPos = getSnappedPosition(ptr, GRID_SIZE, walls);
                    setMousePos((prev) => {
                        if (prev && prev.x === newPos.x && prev.y === newPos.y) return prev;
                        return newPos;
                    });
                }}

                onContextMenu={(e) => {
                    e.evt.preventDefault();
                    if (toolMode !== "draw") return;
                    setDrawStartPoint(null);
                    setMousePos(null);
                }}
            >
                {/* Layer 1: Grid (non-interactive) */}
                {gridLinesLayer}

                {/* Layer 2: Wall Outlines (Pass 1 - Non-interactive)
                    Vẽ viền dày hơn để che lấp chỗ giao nhau bên trong */}
                <Layer listening={false}>
                    {walls.map((wall) => {
                        const selected = wall.id === selectedId;
                        return (
                            <Rect
                                key={`outline-${wall.id}`}
                                x={wall.x} y={wall.y}
                                width={wall.w + 4} height={wall.h + 4}
                                offsetX={(wall.w + 4) / 2} offsetY={(wall.h + 4) / 2}
                                rotation={wall.rotation}
                                fill={selected ? "#bae6fd" : "#475569"} // Màu viền
                                cornerRadius={2} // Bo nhẹ để che khuyết điểm ngã ba
                            />
                        );
                    })}
                </Layer>

                {/* Layer 3: Wall Fills + Endpoints (Pass 2 - Interactive) 
                    Vẽ ruột đè lên lớp viền, làm biến mất hoàn toàn các đường chồng chéo */}
                <Layer>
                    {walls.map((wall) => {
                        const selected = wall.id === selectedId;
                        return (
                            <Rect
                                key={`fill-${wall.id}`}
                                x={wall.x} y={wall.y}
                                width={wall.w} height={wall.h}
                                offsetX={wall.w / 2} offsetY={wall.h / 2}
                                rotation={wall.rotation}
                                fill={selected ? "#38bdf8" : "#94a3b8"} // Màu ruột
                                draggable
                                
                                dragBoundFunc={(pos) =>
                                    clampDragPos(wall.id, pos, viewportWidth, viewportHeight)
                                }

                                onMouseDown={() => setSelectedId(wall.id)}
                                onTap={() => setSelectedId(wall.id)}

                                onDragStart={() => {
                                    dispatch({ type: "BEGIN_DRAG", wallId: wall.id });
                                }}

                                onDragMove={(e) => {
                                    const nx = e.target.x();
                                    const ny = e.target.y();
                                    dispatch({
                                        type: "MOVE_WALL",
                                        wallId: wall.id,
                                        x: toWorldX(nx, originX),
                                        z: toWorldZ(ny, originY),
                                    });
                                }}

                                onDragEnd={(e) => {
                                    const nx = e.target.x();
                                    const ny = e.target.y();

                                    dispatch({
                                        type: "MOVE_WALL",
                                        wallId: wall.id,
                                        x: toWorldX(nx, originX),
                                        z: toWorldZ(ny, originY),
                                    });
                                    dispatch({ type: "END_DRAG", wallId: wall.id });
                                }}
                            />
                        );
                    })}

                    {/* Hiển thị 2 điểm mút khi được chọn */}
                    {selectedWall && activeEndpoints && (
                        <>
                            {/* Endpoint 1 (Start) */}
                            <Circle
                                x={activeEndpoints[0].x} y={activeEndpoints[0].y}
                                radius={8}
                                fill="#ffffff" stroke="#0ea5e9" strokeWidth={3}
                                draggable
                                onDragStart={(e) => {
                                    e.cancelBubble = true;
                                    dispatch({ type: "BEGIN_DRAG", wallId: selectedWall.id });
                                    p1SafePos.current = { x: e.target.x(), y: e.target.y() };
                                }}
                                dragBoundFunc={(pos) => {
                                    // Bắt dính vào các điểm mút tường khác
                                    const snapped = getSnappedPosition(pos, GRID_SIZE, walls, selectedWall.id);
                                    
                                    const p2 = activeEndpoints[1];
                                    const dx = p2.x - snapped.x;
                                    const dy = p2.y - snapped.y;
                                    const len = Math.hypot(dx, dy) + selectedWall.h;
                                    const rot = Math.atan2(dy, dx);
                                    const cx = (snapped.x + p2.x) / 2;
                                    const cy = (snapped.y + p2.y) / 2;
                                    
                                    const nx = toWorldX(cx, originX);
                                    const ny = toWorldZ(cy, originY);
                                    const nw = Math.max(0.01, len / PX_PER_WORLD);
                                    const nh = Math.max(0.01, selectedWall.h / PX_PER_WORLD);
                                    const nRotY = -(rot * Math.PI) / 180;
                                    
                                    if (window.gameEngine?.api.wouldCollide2D?.(selectedWall.id, nx, ny, nw, nh, nRotY)) {
                                        return p1SafePos.current || { x: activeEndpoints[0].x, y: activeEndpoints[0].y };
                                    }
                                    
                                    p1SafePos.current = snapped;
                                    return snapped;
                                }}
                                onDragMove={(e) => {
                                    e.cancelBubble = true;
                                    const nx = e.target.x();
                                    const ny = e.target.y();
                                    const p2 = activeEndpoints[1];
                                    const dx = p2.x - nx;
                                    const dy = p2.y - ny;
                                    const len = Math.hypot(dx, dy) + selectedWall.h;
                                    const rot = Math.atan2(dy, dx);
                                    const cx = (nx + p2.x) / 2;
                                    const cy = (ny + p2.y) / 2;

                                    dispatch({
                                        type: "RESIZE_WALL",
                                        wallId: selectedWall.id,
                                        x: toWorldX(cx, originX),
                                        z: toWorldZ(cy, originY),
                                        w: Math.max(0.01, len / PX_PER_WORLD),
                                        d: Math.max(0.01, selectedWall.h / PX_PER_WORLD),
                                        rotY: -(rot * Math.PI) / 180,
                                    });
                                }}
                                onDragEnd={(e) => {
                                    e.cancelBubble = true;
                                    dispatch({ type: "END_DRAG", wallId: selectedWall.id });
                                }}
                                onMouseEnter={(e) => {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = "crosshair";
                                }}
                                onMouseLeave={(e) => {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = "default";
                                }}
                            />

                            {/* Endpoint 2 (End) */}
                            <Circle
                                x={activeEndpoints[1].x} y={activeEndpoints[1].y}
                                radius={8}
                                fill="#ffffff" stroke="#0ea5e9" strokeWidth={3}
                                draggable
                                onDragStart={(e) => {
                                    e.cancelBubble = true;
                                    dispatch({ type: "BEGIN_DRAG", wallId: selectedWall.id });
                                    p2SafePos.current = { x: e.target.x(), y: e.target.y() };
                                }}
                                dragBoundFunc={(pos) => {
                                    const snapped = getSnappedPosition(pos, GRID_SIZE, walls, selectedWall.id);
                                    const p1 = activeEndpoints[0];
                                    const dx = snapped.x - p1.x;
                                    const dy = snapped.y - p1.y;
                                    const len = Math.hypot(dx, dy) + selectedWall.h;
                                    const rot = Math.atan2(dy, dx);
                                    const cx = (p1.x + snapped.x) / 2;
                                    const cy = (p1.y + snapped.y) / 2;
                                    
                                    const nx = toWorldX(cx, originX);
                                    const ny = toWorldZ(cy, originY);
                                    const nw = Math.max(0.01, len / PX_PER_WORLD);
                                    const nh = Math.max(0.01, selectedWall.h / PX_PER_WORLD);
                                    const nRotY = -(rot * Math.PI) / 180;
                                    
                                    if (window.gameEngine?.api.wouldCollide2D?.(selectedWall.id, nx, ny, nw, nh, nRotY)) {
                                        return p2SafePos.current || { x: activeEndpoints[1].x, y: activeEndpoints[1].y };
                                    }
                                    
                                    p2SafePos.current = snapped;
                                    return snapped;
                                }}
                                onDragMove={(e) => {
                                    e.cancelBubble = true;
                                    const nx = e.target.x();
                                    const ny = e.target.y();
                                    const p1 = activeEndpoints[0];
                                    const dx = nx - p1.x;
                                    const dy = ny - p1.y;
                                    const len = Math.hypot(dx, dy) + selectedWall.h;
                                    const rot = Math.atan2(dy, dx);
                                    const cx = (p1.x + nx) / 2;
                                    const cy = (p1.y + ny) / 2;

                                    dispatch({
                                        type: "RESIZE_WALL",
                                        wallId: selectedWall.id,
                                        x: toWorldX(cx, originX),
                                        z: toWorldZ(cy, originY),
                                        w: Math.max(0.01, len / PX_PER_WORLD),
                                        d: Math.max(0.01, selectedWall.h / PX_PER_WORLD),
                                        rotY: -(rot * Math.PI) / 180,
                                    });
                                }}
                                onDragEnd={(e) => {
                                    e.cancelBubble = true;
                                    dispatch({ type: "END_DRAG", wallId: selectedWall.id });
                                }}
                                onMouseEnter={(e) => {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = "crosshair";
                                }}
                                onMouseLeave={(e) => {
                                    const container = e.target.getStage()?.container();
                                    if (container) container.style.cursor = "default";
                                }}
                            />
                        </>
                    )}
                </Layer>

                {/* Layer 4: Draw preview (non-interactive) */}
                <Layer listening={false}>
                    {previewWall && (
                        <Rect
                            x={previewWall.centerX} y={previewWall.centerY}
                            width={previewWall.width} height={WALL_THICKNESS}
                            offsetX={previewWall.width / 2} offsetY={WALL_THICKNESS / 2}
                            rotation={previewWall.rotation}
                            fill="rgba(56,189,248,0.35)" stroke="#38bdf8" strokeWidth={1}
                            dash={[5, 5]}
                        />
                    )}
                </Layer>

                {/* Layer 5: Label (non-interactive) */}
                <Layer listening={false}>
                    {selectedWall && (
                        <Text
                            x={selectedWall.x - selectedWall.w / 2}
                            y={selectedWall.y - selectedWall.h / 2 - 20}
                            text={`Wall #${selectedWall.id}`}
                            fill="#e2e8f0" fontSize={12}
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
}
