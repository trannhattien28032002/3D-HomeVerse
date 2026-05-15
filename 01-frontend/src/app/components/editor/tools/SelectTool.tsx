import React from "react";
import { Circle, Layer, Line, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import type { Wall2D } from "src/app/store/useFloorPlanStore";
import type { ToolBase, ToolContext, WallHandlers } from "./ToolBase";
import { toWorldX, toWorldZ, snapToNodeOrGrid, WALL_THICKNESS, HANDLE_HIDE_BELOW } from "./toolUtils";

// ── Internal drag state ───────────────────────────────────────────────────────

type WallDragOrigin = {
    startX: number; startY: number;
    endX: number;   endY: number;
    startNodeId: number; endNodeId: number;
    pointerStartX: number; pointerStartY: number;
};

// ── SelectTool ────────────────────────────────────────────────────────────────

/**
 * SelectTool — tool chọn và di chuyển tường trong chế độ select.
 *
 * Tính năng:
 *   - Click wall → chọn đơn; Shift+click → chọn thêm/bỏ chọn
 *   - Kéo wall body → di chuyển cả 2 node cùng lúc (giữ nguyên độ dài/góc)
 *   - Kéo endpoint handle → MOVE_NODE + merge nếu snap vào node khác / SPLIT nếu snap vào wall
 *   - Click vào canvas trống → bỏ chọn tất cả
 *
 * Drag wall body:
 *   wallDragOrigin lưu vị trí ban đầu của 2 node + pointer.
 *   onDragMove: snaps startNode → tính delta → apply delta lên cả endNode.
 *   onDragEnd: RESOLVE_INTERSECTIONS + commitTransaction.
 *
 * Drag endpoint handle:
 *   dragBoundFunc: snap trong screen-space trước khi Konva apply position.
 *   onDragEnd: nếu snap vào node → MERGE_NODE; snap vào wall → SPLIT_WALL; else → MOVE_NODE.
 */
export class SelectTool implements ToolBase {
    private ctx!: ToolContext;
    /** Lưu trạng thái khi bắt đầu kéo wall body — cần để tính delta di chuyển. */
    private wallDragOrigin: WallDragOrigin | null = null;
    /** Lưu vị trí world ban đầu của node khi kéo endpoint handle. */
    private nodeDragOrigin = new Map<number, { wx: number; wz: number }>();

    update(ctx: ToolContext): void {
        this.ctx = ctx;
    }

    onStageMouseDown(e: KonvaEventObject<MouseEvent>): void {
        // Deselect when clicking on empty canvas (not on a wall shape)
        if (e.target === e.target.getStage()) {
            this.ctx.setSelectedWallIds(new Set());
        }
    }

    onStageClick(_e: KonvaEventObject<MouseEvent>): void { /* handled via onMouseDown */ }

    onStageMouseMove(_e: KonvaEventObject<MouseEvent>): void { /* no-op */ }

    onStageContextMenu(e: KonvaEventObject<MouseEvent>): void {
        e.evt.preventDefault();
    }

    onCancel(): void {
        this.ctx.cancelTransaction();
        this.wallDragOrigin = null;
        this.nodeDragOrigin.clear();
    }

    getWallProps(wall: Wall2D): WallHandlers {
        const selected = this.ctx.selectedWallIds.has(wall.id);

        return {
            fill:     selected ? "#f8b400" : "#d5c4ac",
            stroke:   selected ? "#7c5800" : "#d5c4ac",
            draggable: true,

            onMouseDown: (e: KonvaEventObject<MouseEvent>) => {
                if (e.evt.shiftKey) {
                    this.ctx.setSelectedWallIds(prev => {
                        const next = new Set(prev);
                        if (next.has(wall.id)) next.delete(wall.id);
                        else next.add(wall.id);
                        return next;
                    });
                } else {
                    this.ctx.setSelectedWallIds(new Set([wall.id]));
                }
            },

            onTap: () => this.ctx.setSelectedWallIds(new Set([wall.id])),

            onDragStart: (e: any) => {
                if (!e.evt.shiftKey) this.ctx.setSelectedWallIds(new Set([wall.id]));
                const ptr = e.target.getStage()?.getRelativePointerPosition();
                const { nodeById } = this.ctx;
                const sn = nodeById.get(wall.startNodeId);
                const en = nodeById.get(wall.endNodeId);
                if (!ptr || !sn || !en) return;
                this.wallDragOrigin = {
                    startX: sn.x, startY: sn.y,
                    endX:   en.x, endY:   en.y,
                    startNodeId: sn.id, endNodeId: en.id,
                    pointerStartX: ptr.x, pointerStartY: ptr.y,
                };
                this.ctx.beginTransaction("move wall");
            },

            onDragMove: (e: any) => {
                const origin = this.wallDragOrigin;
                const ptr = e.target.getStage()?.getRelativePointerPosition();
                if (!origin || !ptr) return;
                e.target.x(0); e.target.y(0);

                const { nodes, walls, originX, originY, stageScaleRef, dispatch } = this.ctx;
                const dx = ptr.x - origin.pointerStartX;
                const dy = ptr.y - origin.pointerStartY;
                const { pos: snappedStart } = snapToNodeOrGrid(
                    { x: origin.startX + dx, y: origin.startY + dy },
                    nodes, walls, originX, originY, origin.startNodeId, stageScaleRef.current,
                );
                const actualDx = snappedStart.x - origin.startX;
                const actualDy = snappedStart.y - origin.startY;
                dispatch({ type: "MOVE_NODE", nodeId: origin.startNodeId, x: toWorldX(snappedStart.x, originX), z: toWorldZ(snappedStart.y, originY) });
                dispatch({ type: "MOVE_NODE", nodeId: origin.endNodeId,   x: toWorldX(origin.endX + actualDx, originX), z: toWorldZ(origin.endY + actualDy, originY) });
            },

            onDragEnd: (e: any) => {
                this.wallDragOrigin = null;
                e.target.x(0); e.target.y(0);
                this.ctx.dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: wall.id });
                this.ctx.commitTransaction();
            },
        };
    }

    renderOverlay(): React.ReactNode {
        const {
            nodes, walls, selectedWallIds, nodeById,
            stageScale, stageScaleRef, stagePosRef,
            originX, originY,
            dispatch, setSelectedWallIds, nextWallId,
            commitTransaction, beginTransaction,
            ss, sh,
        } = this.ctx;

        const singleId = selectedWallIds.size === 1 ? [...selectedWallIds][0] : null;
        const singleWall = singleId !== null ? walls.find(w => w.id === singleId) ?? null : null;
        if (!singleWall) return null;

        const sn = nodeById.get(singleWall.startNodeId);
        const en = nodeById.get(singleWall.endNodeId);
        if (!sn || !en) return null;

        const handles = [
            { node: sn, key: "s" },
            { node: en, key: "e" },
        ];

        return (
            <Layer>
                {/* Blue centerline highlight */}
                <Line
                    points={[sn.x, sn.y, en.x, en.y]}
                    stroke="#bae6fd" strokeWidth={WALL_THICKNESS + 4}
                    lineCap="round" listening={false}
                />
                <Line
                    points={[sn.x, sn.y, en.x, en.y]}
                    stroke="#38bdf8" strokeWidth={WALL_THICKNESS}
                    lineCap="round" listening={false}
                />

                {/* Endpoint handles */}
                {stageScale >= HANDLE_HIDE_BELOW && handles.map(({ node, key }) => (
                    <Circle
                        key={`handle-${key}-${node.id}`}
                        x={node.x} y={node.y}
                        radius={sh(9)}
                        fill="#ffffff" stroke="#0ea5e9" strokeWidth={sh(3)}
                        draggable
                        dragBoundFunc={(absPos: any) => {
                            const sc = stageScaleRef.current;
                            const sp = stagePosRef.current;
                            const canvas = { x: (absPos.x - sp.x) / sc, y: (absPos.y - sp.y) / sc };
                            const { pos: snapped } = snapToNodeOrGrid(canvas, nodes, walls, originX, originY, node.id, stageScaleRef.current);
                            return { x: snapped.x * sc + sp.x, y: snapped.y * sc + sp.y };
                        }}
                        onDragStart={() => {
                            this.nodeDragOrigin.set(node.id, { wx: toWorldX(node.x, originX), wz: toWorldZ(node.y, originY) });
                            beginTransaction("move node");
                        }}
                        onDragMove={(ev: any) => {
                            dispatch({ type: "MOVE_NODE", nodeId: node.id, x: toWorldX(ev.target.x(), originX), z: toWorldZ(ev.target.y(), originY) });
                        }}
                        onDragEnd={(ev: any) => {
                            const raw = { x: ev.target.x(), y: ev.target.y() };
                            const { pos, snappedNodeId: snapNode, snappedWallId: snapWall } = snapToNodeOrGrid(raw, nodes, walls, originX, originY, node.id, stageScaleRef.current);
                            if (snapNode !== null) {
                                dispatch({ type: "MERGE_NODE", sourceNodeId: node.id, targetNodeId: snapNode });
                                setSelectedWallIds(new Set());
                            } else if (snapWall !== null) {
                                dispatch({ type: "SPLIT_WALL", originalWallId: snapWall, newWallId: nextWallId(), newNodeId: node.id, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
                            } else {
                                dispatch({ type: "MOVE_NODE", nodeId: node.id, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
                            }
                            dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: singleWall.id });
                            this.nodeDragOrigin.delete(node.id);
                            commitTransaction();
                        }}
                        onMouseEnter={(ev: any) => { const c = ev.target.getStage()?.container(); if (c) c.style.cursor = "crosshair"; }}
                        onMouseLeave={(ev: any) => { const c = ev.target.getStage()?.container(); if (c) c.style.cursor = "default"; }}
                    />
                ))}

                {/* Wall ID label */}
                <Text
                    x={singleWall.cx - ss(30)} y={singleWall.cy - ss(20)}
                    text={`Wall #${singleWall.id}`}
                    fill="#7c5800" fontSize={ss(12)} fontStyle="bold"
                    listening={false}
                />
            </Layer>
        );
    }

    deactivate(): void {
        this.wallDragOrigin = null;
        this.nodeDragOrigin.clear();
    }
}
