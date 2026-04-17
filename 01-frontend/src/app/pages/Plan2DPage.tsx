import { useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { usePlanStore } from "@/app/store/usePlanStore";

const GRID_SIZE = 20;

function snap(value: number, step: number) {
    return Math.round(value / step) * step;
}

export default function Plan2DPage() {
    const walls = usePlanStore((state) => state.walls);
    const addWallToStore = usePlanStore((state) => state.addWall);
    const updateWall = usePlanStore((state) => state.updateWall);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const shapeRefs = useRef<Record<number, Konva.Rect | null>>({});
    const transformerRef = useRef<Konva.Transformer | null>(null);
    const [viewport, setViewport] = useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight
    }));

    const selectedWall = useMemo(
        () => walls.find((w) => w.id === selectedId) ?? null,
        [walls, selectedId]
    );

    useEffect(() => {
        const onResize = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        if (!transformerRef.current) return;
        if (selectedId === null) {
            transformerRef.current.nodes([]);
            transformerRef.current.getLayer()?.batchDraw();
            return;
        }

        const selectedNode = shapeRefs.current[selectedId];
        transformerRef.current.nodes(selectedNode ? [selectedNode] : []);
        transformerRef.current.getLayer()?.batchDraw();
    }, [selectedId, walls]);

    const gridLines = useMemo(() => {
        const lines: Array<{ points: number[]; key: string }> = [];
        for (let x = 0; x <= viewport.width; x += GRID_SIZE) {
            lines.push({ key: `vx-${x}`, points: [x, 0, x, viewport.height] });
        }
        for (let y = 0; y <= viewport.height; y += GRID_SIZE) {
            lines.push({ key: `hz-${y}`, points: [0, y, viewport.width, y] });
        }
        return lines;
    }, [viewport.height, viewport.width]);

    const addWall = () => {
        const nextId = addWallToStore({
            x: snap(viewport.width / 2 - 100, GRID_SIZE),
            y: snap(viewport.height / 2 - 10, GRID_SIZE),
            w: 200,
            h: 20,
            rotation: 0
        });
        setSelectedId(nextId);
    };

    return (
        <div style={{ width: "100vw", height: "100vh", background: "#020617" }}>
            <div
                style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 10,
                    color: "#e2e8f0",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12
                }}
            >
                Plan2D Konva - add/drag/transform walls, snap grid {GRID_SIZE}px
                {selectedWall
                    ? ` | selected: #${selectedWall.id} | pos(${selectedWall.x}, ${selectedWall.y}) | rot(${Math.round(selectedWall.rotation)}°)`
                    : ""}
            </div>
            <div
                style={{
                    position: "absolute",
                    top: 62,
                    left: 12,
                    zIndex: 10
                }}
            >
                <button
                    type="button"
                    onClick={addWall}
                    style={{
                        background: "#38bdf8",
                        color: "#0f172a",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer"
                    }}
                >
                    + Add Wall
                </button>
            </div>
            <Stage
                width={viewport.width}
                height={viewport.height}
                style={{ display: "block", background: "#0f172a" }}
                onMouseDown={(e) => {
                    if (e.target === e.target.getStage()) {
                        setSelectedId(null);
                    }
                }}
            >
                <Layer listening={false}>
                    {gridLines.map((line) => (
                        <Line
                            key={line.key}
                            points={line.points}
                            stroke="#1e293b"
                            strokeWidth={1}
                        />
                    ))}
                </Layer>

                <Layer>
                    {walls.map((wall) => {
                        const isSelected = wall.id === selectedId;
                        return (
                            <Rect
                                key={wall.id}
                                ref={(node) => {
                                    shapeRefs.current[wall.id] = node;
                                }}
                                x={wall.x}
                                y={wall.y}
                                width={wall.w}
                                height={wall.h}
                                rotation={wall.rotation}
                                fill={isSelected ? "#38bdf8" : "#94a3b8"}
                                stroke={isSelected ? "#e0f2fe" : "#cbd5e1"}
                                strokeWidth={isSelected ? 2 : 1}
                                draggable
                                dragBoundFunc={(pos) => {
                                    let nx = snap(pos.x, GRID_SIZE);
                                    let ny = snap(pos.y, GRID_SIZE);

                                    const engine = (window as any).gameEngine;
                                    if (engine) {
                                        const PX_PER_WORLD = 20; // Khớp với Canvas.tsx
                                        const originX = viewport.width / 2;
                                        const originY = viewport.height / 2;

                                        // Chuyển 2D screen sang 3D world
                                        const worldX = (nx + wall.w / 2 - originX) / PX_PER_WORLD;
                                        const worldZ = (ny + wall.h / 2 - originY) / PX_PER_WORLD;

                                        // Hỏi mượn hệ thống Vật lý của 3D
                                        const safePos = engine.api.clampMovement2D(wall.id, worldX, worldZ);

                                        // Trả về 2D screen
                                        nx = safePos.x * PX_PER_WORLD + originX - wall.w / 2;
                                        ny = safePos.z * PX_PER_WORLD + originY - wall.h / 2;
                                    }

                                    return { x: nx, y: ny };
                                }}
                                onMouseDown={() => setSelectedId(wall.id)}
                                onTap={() => setSelectedId(wall.id)}
                                onDragEnd={(e) => {
                                    const nx = snap(e.target.x(), GRID_SIZE);
                                    const ny = snap(e.target.y(), GRID_SIZE);
                                    updateWall(wall.id, { x: nx, y: ny });
                                }}
                                onTransformEnd={(e) => {
                                    const node = e.target as Konva.Rect;
                                    const scaleX = node.scaleX();
                                    const scaleY = node.scaleY();

                                    node.scaleX(1);
                                    node.scaleY(1);

                                    const updated = {
                                        x: snap(node.x(), GRID_SIZE),
                                        y: snap(node.y(), GRID_SIZE),
                                        rotation: node.rotation(),
                                        w: Math.max(10, node.width() * scaleX),
                                        h: Math.max(10, node.height() * scaleY)
                                    };

                                    updateWall(wall.id, updated);
                                }}
                            />
                        );
                    })}
                    <Transformer
                        ref={(node) => {
                            transformerRef.current = node;
                        }}
                        rotateEnabled
                        enabledAnchors={[
                            "top-left",
                            "top-right",
                            "bottom-left",
                            "bottom-right",
                            "middle-left",
                            "middle-right",
                            "top-center",
                            "bottom-center"
                        ]}
                        boundBoxFunc={(oldBox, newBox) => {
                            if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) {
                                return oldBox;
                            }
                            return newBox;
                        }}
                        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                    />
                </Layer>

                <Layer listening={false}>
                    {selectedWall && (
                        <Text
                            x={selectedWall.x}
                            y={selectedWall.y - 18}
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

