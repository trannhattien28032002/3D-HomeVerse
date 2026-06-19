import React from "react";
import { Group, Layer, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import type { ToolBase, ToolContext, WallHandlers } from "./ToolBase";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { occupancyLane } from "src/shared/geometry/wallMount";
import { buildOccupiedRanges, occupiedOverlaps } from "src/engine/utils/wallOccupancy";
import { projectToNearestWall, buildOpeningOccupancy } from "src/app/features/plan2d/wallItemDrag2D";

/**
 * WallPlacementTool — đặt wall item (cửa, cửa sổ, kệ treo) lên tường trong PlanView2D.
 *
 * Luồng:
 *   setTarget(modelId, onComplete) → ghost bám theo tường gần nhất dưới con trỏ
 *   left-click  → dispatch PLACE_WALL_ITEM {hostWallId, t, side} → onComplete()
 *   right-click / Esc → onComplete() (hủy)
 *
 * Ghost render: Rect bám dọc tim tường, đỏ khi overlap.
 */
export class WallPlacementTool implements ToolBase {
    private ctx!: ToolContext;
    private modelId: string | null = null;
    private onComplete: (() => void) | null = null;
    private footprintWidth = 0.9;

    /** Trạng thái ghost hiện tại: vị trí tâm (px) + góc xoay + wall context. */
    private ghost: {
        cx: number;      // tâm px canvas X
        cy: number;      // tâm px canvas Y
        angleDeg: number; // góc của tường (Konva rotation, deg, CW)
        hostWallId: string;
        t: number;
        side: number;
    } | null = null;
    private colliding = false;

    update(ctx: ToolContext): void {
        this.ctx = ctx;
    }

    setTarget(modelId: string, onComplete: () => void): void {
        this.modelId = modelId;
        this.onComplete = onComplete;
        this.footprintWidth = getFootprint2D(modelId).width;
        this.ghost = null;
        this.colliding = false;
    }

    private complete(): void {
        const cb = this.onComplete;
        this.modelId = null;
        this.onComplete = null;
        this.ghost = null;
        this.colliding = false;
        cb?.();
    }

    /**
     * Tìm wall gần nhất với con trỏ và tính toán vị trí ghost.
     * Dùng chung `projectToNearestWall` với FurnitureLayer (kéo cửa) — không fork toán chiếu.
     */
    private computeGhost(worldX: number, worldZ: number): void {
        const { walls, nodeById, transform } = this.ctx;
        const proj = projectToNearestWall(walls, nodeById, worldX, worldZ, transform, this.footprintWidth, undefined, undefined, resolveWallItemDims(this.modelId!));
        if (!proj) { this.ghost = null; this.colliding = false; return; }

        const occ = buildOpeningOccupancy(this.ctx.furniture, proj.hostWallId, proj.wallLen);
        const lane = occupancyLane(resolveWallItemDims(this.modelId!).behavior, proj.side);
        this.colliding = occupiedOverlaps(proj.t, proj.halfWidthT, lane, buildOccupiedRanges(occ));

        this.ghost = {
            cx: proj.cx, cy: proj.cy, angleDeg: proj.angleDeg,
            hostWallId: proj.hostWallId, t: proj.t, side: proj.side,
        };
    }

    onStageMouseMove(e: KonvaEventObject<MouseEvent>): void {
        if (!this.modelId) return;
        const stage = e.target.getStage();
        const ptr = stage?.getRelativePointerPosition();
        if (!ptr) return;
        this.computeGhost(this.ctx.transform.toWorldX(ptr.x), this.ctx.transform.toWorldZ(ptr.y));
        this.ctx.requestUpdate();
    }

    onStageMouseDown(e: KonvaEventObject<MouseEvent>): void {
        if (!this.modelId || e.evt.button !== 0) return;
        e.cancelBubble = true;
        if (!this.ghost) {
            const ptr = e.target.getStage()?.getRelativePointerPosition();
            if (ptr) this.computeGhost(this.ctx.transform.toWorldX(ptr.x), this.ctx.transform.toWorldZ(ptr.y));
        }
        if (!this.ghost) return;
        if (this.colliding) { this.ctx.requestUpdate(); return; }
        // Dùng asyncTransaction để snapshot được chụp TRƯỚC và đóng SAU khi entity spawn xong.
        // Đảm bảo undo sau placement xóa được entity (R1 fix).
        const cmd = {
            type: "PLACE_WALL_ITEM" as const,
            modelId: this.modelId,
            hostWallId: this.ghost.hostWallId,
            t: this.ghost.t,
            side: this.ghost.side,
        };
        this.ctx.asyncTransaction("place wall item", () => this.ctx.dispatchAsync(cmd))
            .catch(err => console.error("[WallPlacementTool] place failed:", err));
        this.complete();
    }

    onStageClick(): void { /* đặt ở onStageMouseDown */ }

    onStageContextMenu(e: KonvaEventObject<MouseEvent>): void {
        e.evt.preventDefault();
        this.complete();
    }

    onCancel(): void {
        this.complete();
    }

    getWallProps(): WallHandlers {
        return { fill: "#d5c4ac", stroke: "#d5c4ac", draggable: false };
    }

    renderOverlay(): React.ReactNode {
        if (!this.modelId || !this.ghost) return null;
        const { transform, ss } = this.ctx;
        const { cx, cy, angleDeg } = this.ghost;
        const w = transform.toPxDim(this.footprintWidth);
        // Depth hiển thị cố định 8px để ghost dễ thấy trên tim tường.
        const d = ss(8);
        const bad = this.colliding;

        return (
            <Layer listening={false}>
                <Group x={cx} y={cy} rotation={angleDeg} opacity={0.75} perfectDrawEnabled={false}>
                    <Rect
                        width={w} height={d}
                        offsetX={w / 2} offsetY={d / 2}
                        fill={bad ? "rgba(200,30,30,0.35)" : "rgba(80,100,220,0.25)"}
                        stroke={bad ? "#c81e1e" : "#3040cc"}
                        strokeWidth={ss(1.5)}
                        dash={bad ? [ss(5), ss(4)] : undefined}
                    />
                </Group>
                {/* Tâm thập tự */}
                <Rect x={cx - ss(5)} y={cy - ss(0.5)} width={ss(10)} height={ss(1)} fill={bad ? "#c81e1e" : "#3040cc"} />
                <Rect x={cx - ss(0.5)} y={cy - ss(5)} width={ss(1)} height={ss(10)} fill={bad ? "#c81e1e" : "#3040cc"} />
            </Layer>
        );
    }

    deactivate(): void {
        this.modelId = null;
        this.onComplete = null;
        this.ghost = null;
        this.colliding = false;
    }
}
