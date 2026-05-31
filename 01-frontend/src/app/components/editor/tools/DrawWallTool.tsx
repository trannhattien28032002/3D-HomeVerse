import React from "react";
import { Circle, Layer, Line } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";

import type { Wall2D } from "src/app/store/useFloorPlanSnapshot";
import type { ToolBase, ToolContext, WallHandlers } from "./ToolBase";
import {
    toWorldX, toWorldZ,
    snapToNodeOrGrid, applyAngleSnap,
    WALL_THICKNESS, WALL_THICKNESS_M, MIN_WALL_PX, HANDLE_HIDE_BELOW,
} from "./toolUtils";
import { wallSegmentPolygon, collidesWithFurniture } from "./collision2D";

/** Màu preview tường: bình thường vs khi cắt qua nội thất. */
const PREVIEW_STROKE_OK = "#7c5800";
const PREVIEW_STROKE_BAD = "#c81e1e";

// ── Internal state type ───────────────────────────────────────────────────────

type DrawState = {
    startNodeId: number;
    startPos: { x: number; y: number };
    startNodeCommitted: boolean;
};

/**
 * DrawWallTool — tool vẽ tường trong chế độ 2D Floor Plan.
 *
 * Flow tương tác:
 *   Click 1: xác định điểm bắt đầu tường (startNode)
 *     - Snap vào node hiện có → dùng lại node đó
 *     - Snap vào wall → SPLIT_WALL tại điểm click, dùng node mới
 *     - Click vào vùng trống → lazy node (chưa dispatch ENSURE_NODE, chờ click 2)
 *   Mouse move: cập nhật preview line imperatively (không trigger React re-render)
 *   Click 2: xác định điểm kết thúc → dispatch ADD_WALL + RESOLVE_INTERSECTIONS
 *   End node trở thành start node của đoạn tiếp theo (chain drawing)
 *   Right-click / Escape: hủy bỏ đoạn đang vẽ
 *
 * Tối ưu preview:
 *   previewLineNode là Konva ref trực tiếp — gọi .points() imperative để update
 *   canvas mà không tạo React re-render (60fps mouse move mà không tốn render cycle).
 *
 * Snap priority: node snap > wall snap > angle snap > grid snap
 */
export class DrawWallTool implements ToolBase {
    private ctx!: ToolContext;
    private drawState: DrawState | null = null;
    private mousePos: { x: number; y: number } | null = null;
    /** true khi đoạn đang vẽ cắt qua nội thất → preview đỏ, chặn commit. */
    private colliding = false;
    /** Ref trực tiếp tới Konva Line node — update imperatively không qua React. */
    private previewLineNode: Konva.Line | null = null;

    update(ctx: ToolContext): void {
        this.ctx = ctx;
    }

    onStageMouseDown(_e: KonvaEventObject<MouseEvent>): void { /* no-op */ }

    onStageClick(e: KonvaEventObject<MouseEvent>): void {
        if (e.evt.button !== 0) return;
        const { nodes, walls, nodeById, originX, originY, stageScaleRef, nextNodeId, nextWallId, dispatch, withTransaction } = this.ctx;

        const ptr = e.target.getStage()?.getRelativePointerPosition();
        if (!ptr) return;

        const { pos: rawPos, snappedNodeId, snappedWallId } = snapToNodeOrGrid(
            ptr, nodes, walls, originX, originY, this.drawState?.startNodeId, stageScaleRef.current, nodeById,
        );
        const pos = (this.drawState?.startNodeCommitted && snappedNodeId === null && snappedWallId === null)
            ? applyAngleSnap(rawPos, this.drawState.startNodeId, nodes, walls)
            : rawPos;

        // ── First click — establish draw start ────────────────────────────────
        if (!this.drawState) {
            let nodeId: number;
            let startNodeCommitted: boolean;

            if (snappedNodeId !== null) {
                nodeId = snappedNodeId;
                startNodeCommitted = true;
            } else if (snappedWallId !== null) {
                nodeId = nextNodeId();
                const capturedWallId = snappedWallId;
                withTransaction("split wall at start", () => {
                    dispatch({ type: "SPLIT_WALL", originalWallId: capturedWallId, newWallId: nextWallId(), newNodeId: nodeId, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
                });
                startNodeCommitted = true;
            } else {
                nodeId = nextNodeId();
                startNodeCommitted = false;
            }

            this.drawState = { startNodeId: nodeId, startPos: pos, startNodeCommitted };
            this.ctx.requestUpdate();
            return;
        }

        // ── Second click — commit wall segment ────────────────────────────────
        const len = Math.hypot(pos.x - this.drawState.startPos.x, pos.y - this.drawState.startPos.y);
        if (len < MIN_WALL_PX) return;

        // Chặn commit khi đoạn cắt qua nội thất — giữ startNode để người dùng đổi hướng.
        if (this.segmentHitsFurniture(this.drawState.startPos, pos)) {
            this.colliding = true;
            this.ctx.requestUpdate();
            return;
        }

        let endNodeId = -1;
        let newWallId = -1;

        withTransaction("draw wall", () => {
            if (!this.drawState!.startNodeCommitted) {
                dispatch({ type: "ENSURE_NODE", nodeId: this.drawState!.startNodeId, x: toWorldX(this.drawState!.startPos.x, originX), z: toWorldZ(this.drawState!.startPos.y, originY) });
            }

            if (snappedNodeId !== null) {
                endNodeId = snappedNodeId;
            } else if (snappedWallId !== null) {
                endNodeId = nextNodeId();
                const capturedWallId = snappedWallId;
                dispatch({ type: "SPLIT_WALL", originalWallId: capturedWallId, newWallId: nextWallId(), newNodeId: endNodeId, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
            } else {
                endNodeId = nextNodeId();
                dispatch({ type: "ENSURE_NODE", nodeId: endNodeId, x: toWorldX(pos.x, originX), z: toWorldZ(pos.y, originY) });
            }

            newWallId = nextWallId();
            dispatch({ type: "ADD_WALL", wallId: newWallId, startNodeId: this.drawState!.startNodeId, endNodeId, thickness: Math.max(0.01, WALL_THICKNESS_M) });
            dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: newWallId });
        });

        // Chain: the end node of this segment becomes the start of the next
        this.drawState = { startNodeId: endNodeId, startPos: pos, startNodeCommitted: true };
        // Dispatch triggers store → host re-renders → renderOverlay updates automatically
    }

    onStageMouseMove(e: KonvaEventObject<MouseEvent>): void {
        const { nodes, walls, nodeById, originX, originY, stageScaleRef } = this.ctx;
        const ptr = e.target.getStage()?.getRelativePointerPosition();
        if (!ptr) return;

        const snapResult = snapToNodeOrGrid(ptr, nodes, walls, originX, originY, this.drawState?.startNodeId, stageScaleRef.current, nodeById);
        let finalPos = snapResult.pos;
        if (this.drawState?.startNodeCommitted && snapResult.snappedNodeId === null && snapResult.snappedWallId === null) {
            finalPos = applyAngleSnap(finalPos, this.drawState.startNodeId, nodes, walls, nodeById);
        }

        this.mousePos = finalPos;

        // Va chạm: đoạn đang vẽ (OBB dày WALL_THICKNESS) có cắt nội thất nào không.
        this.colliding = this.drawState
            ? this.segmentHitsFurniture(this.drawState.startPos, finalPos)
            : false;

        // Imperative update — updates the canvas without triggering a React re-render
        if (this.previewLineNode && this.drawState) {
            this.previewLineNode.points([
                this.drawState.startPos.x, this.drawState.startPos.y,
                finalPos.x, finalPos.y,
            ]);
            this.previewLineNode.stroke(this.colliding ? PREVIEW_STROKE_BAD : PREVIEW_STROKE_OK);
        }
    }

    /** true nếu OBB của đoạn tường start→end cắt qua bất kỳ nội thất nào. */
    private segmentHitsFurniture(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
        const poly = wallSegmentPolygon(start, end, WALL_THICKNESS);
        return collidesWithFurniture(poly, this.ctx.furniture);
    }

    onStageContextMenu(e: KonvaEventObject<MouseEvent>): void {
        e.evt.preventDefault();
        this.drawState = null;
        this.mousePos = null;
        this.colliding = false;
        this.ctx.requestUpdate();
    }

    onCancel(): void {
        this.ctx.cancelTransaction();
        this.drawState = null;
        this.mousePos = null;
        this.colliding = false;
        this.previewLineNode = null;
        this.ctx.requestUpdate();
    }

    // Draw tool doesn't use wall event handlers — wall layer is non-interactive in draw mode
    getWallProps(_wall: Wall2D): WallHandlers {
        return { fill: "#d5c4ac", stroke: "#d5c4ac", draggable: false };
    }

    renderOverlay(): React.ReactNode {
        const { nodes, stageScale, sh } = this.ctx;
        const ds = this.drawState;
        const mp = this.mousePos;

        return (
            <>
                {/* Draw preview: rubber-band line from start to cursor */}
                <Layer listening={false}>
                    {ds && (
                        <Line
                            ref={(node: Konva.Line | null) => { this.previewLineNode = node; }}
                            points={[
                                ds.startPos.x, ds.startPos.y,
                                mp?.x ?? ds.startPos.x,
                                mp?.y ?? ds.startPos.y,
                            ]}
                            stroke={this.colliding ? PREVIEW_STROKE_BAD : PREVIEW_STROKE_OK}
                            strokeWidth={WALL_THICKNESS}
                            opacity={0.38}
                            lineCap="square"
                        />
                    )}
                    {ds && (
                        <Circle
                            x={ds.startPos.x} y={ds.startPos.y}
                            radius={sh(6)} fill="#f8b400"
                        />
                    )}
                </Layer>

                {/* Node guides: visual hints for snap targets */}
                {stageScale >= HANDLE_HIDE_BELOW && (
                    <Layer listening={false}>
                        {nodes.map(n => (
                            <Circle
                                key={`guide-${n.id}`}
                                x={n.x} y={n.y}
                                radius={sh(5)}
                                fill="#7c5800" stroke="#f8b400" strokeWidth={sh(1.5)}
                            />
                        ))}
                    </Layer>
                )}
            </>
        );
    }

    deactivate(): void {
        this.drawState = null;
        this.mousePos = null;
        this.colliding = false;
        this.previewLineNode = null;
    }
}
