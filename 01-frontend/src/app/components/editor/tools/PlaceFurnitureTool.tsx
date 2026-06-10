import React from "react";
import { Group, Layer, Line, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import type { ToolBase, ToolContext, WallHandlers } from "./ToolBase";
import { toWorldX, toWorldZ, PX_PER_WORLD } from "./toolUtils";
import { obbCorners, collidesWithFurniture, collidesWithWalls } from "./collision2D";
import { getFootprint2D, getTopDownUrl } from "src/engine/catalog/FurnitureCatalog";
import { ensureImage, getLoadedImage } from "src/app/components/editor/furnitureImages";
import { TopDownSprite } from "src/app/components/editor/furnitureSprite";
import { resolveAlignment, type AlignGuide } from "src/shared/geometry/alignment";
import { buildWallSegments2D, buildFurnitureBoxes2D } from "src/app/components/editor/PlanView2D/wallSegments2D";

/**
 * PlaceFurnitureTool — đặt nội thất trong PlanView2D (tab 2D) bằng ghost top-down.
 *
 * Luồng:
 *   setTarget(modelId, onComplete) → ghost theo con trỏ (snap 0.25m)
 *   left-click  → dispatch PLACE_FURNITURE {x,z,rotY:0} → onComplete()
 *   right-click / Esc → onComplete() (hủy, không đặt)
 *
 * Ghost render: ảnh top-down PNG nếu catalog có → else Rect xám gạch đứt.
 */
export class PlaceFurnitureTool implements ToolBase {
    private ctx!: ToolContext;
    private modelId: string | null = null;
    private onComplete: (() => void) | null = null;
    private footprint = { width: 0.8, depth: 0.8 };
    private topDownUrl: string | undefined;
    /** Vị trí ghost world-space (mét), null khi con trỏ chưa di chuyển vào canvas. */
    private ghost: { x: number; z: number } | null = null;
    /** Đường gióng wall-snap hiện tại (world-space) để vẽ trong renderOverlay. */
    private guides: AlignGuide[] = [];
    /** true khi ghost chồng tường hoặc nội thất khác → preview đỏ, chặn đặt. */
    private colliding = false;

    update(ctx: ToolContext): void {
        this.ctx = ctx;
    }

    /** Bắt đầu đặt một model. Gọi từ PlanView2D khi placementModelId đổi. */
    setTarget(modelId: string, onComplete: () => void): void {
        this.modelId = modelId;
        this.onComplete = onComplete;
        this.footprint = getFootprint2D(modelId);
        this.topDownUrl = getTopDownUrl(modelId);
        if (this.topDownUrl) ensureImage(this.topDownUrl);
        this.ghost = null;
        this.guides = [];
        this.colliding = false;
    }

    private complete(): void {
        const cb = this.onComplete;
        this.modelId = null;
        this.onComplete = null;
        this.ghost = null;
        this.guides = [];
        this.colliding = false;
        cb?.();
    }

    /** Cập nhật cờ va chạm theo vị trí ghost hiện tại (OBB ghost vs tường + nội thất). */
    private recomputeCollision(): void {
        if (!this.ghost) { this.colliding = false; return; }
        const { originX, originY, furniture, walls } = this.ctx;
        const cx = this.ghost.x * PX_PER_WORLD + originX;
        const cy = this.ghost.z * PX_PER_WORLD + originY;
        const w = this.footprint.width * PX_PER_WORLD;
        const d = this.footprint.depth * PX_PER_WORLD;
        // Ghost mới luôn đặt rotY = 0 → OBB không xoay.
        const poly = obbCorners(cx, cy, w, d, 0);
        this.colliding = collidesWithFurniture(poly, furniture) || collidesWithWalls(poly, walls);
    }

    /** Snap ghost theo nguồn chân lý chung (edge + wall) từ điểm world. */
    private computeGhost(worldX: number, worldZ: number): void {
        const segs = buildWallSegments2D(this.ctx.walls, this.ctx.nodeById, this.ctx.originX, this.ctx.originY);
        const boxes = buildFurnitureBoxes2D(this.ctx.furniture, this.ctx.originX, this.ctx.originY);
        const r = resolveAlignment({
            cx: worldX, cz: worldZ,
            hw: this.footprint.width / 2, hd: this.footprint.depth / 2,
            rotY: 0, walls: segs, neighbors: boxes,
        });
        this.ghost = { x: r.x, z: r.z };
        this.guides = r.guides;
    }

    onStageMouseMove(e: KonvaEventObject<MouseEvent>): void {
        if (!this.modelId) return;
        const stage = e.target.getStage();
        const ptr = stage?.getRelativePointerPosition();
        if (!ptr) return;
        this.computeGhost(toWorldX(ptr.x, this.ctx.originX), toWorldZ(ptr.y, this.ctx.originY));
        this.recomputeCollision();
        this.ctx.requestUpdate();
    }

    onStageMouseDown(e: KonvaEventObject<MouseEvent>): void {
        if (!this.modelId || e.evt.button !== 0) return;
        e.cancelBubble = true;
        if (!this.ghost) {
            const ptr = e.target.getStage()?.getRelativePointerPosition();
            if (ptr) this.computeGhost(toWorldX(ptr.x, this.ctx.originX), toWorldZ(ptr.y, this.ctx.originY));
        }
        if (!this.ghost) return;
        // Chặn đặt khi chồng tường / nội thất khác — giữ ghost để người dùng chỉnh vị trí.
        this.recomputeCollision();
        if (this.colliding) { this.ctx.requestUpdate(); return; }
        // Dùng asyncTransaction để snapshot được chụp TRƯỚC và đóng SAU khi entity spawn xong.
        // Đảm bảo undo sau placement xóa được entity (R1 fix).
        const cmd = { type: "PLACE_FURNITURE" as const, modelId: this.modelId, x: this.ghost.x, z: this.ghost.z, rotY: 0 };
        this.ctx.asyncTransaction("place furniture", () => this.ctx.dispatchAsync(cmd))
            .catch(err => console.error("[PlaceFurnitureTool] place failed:", err));
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
        const { originX, originY, ss } = this.ctx;
        const cx = this.ghost.x * PX_PER_WORLD + originX;
        const cy = this.ghost.z * PX_PER_WORLD + originY;
        const w = this.footprint.width * PX_PER_WORLD;
        const d = this.footprint.depth * PX_PER_WORLD;

        const img = this.topDownUrl ? getLoadedImage(this.topDownUrl) : null;
        const bad = this.colliding;
        const crossColor = bad ? "#c81e1e" : "#7c5800";

        return (
            <Layer listening={false}>
                {/* Đường gióng wall-snap khi mép ghost áp sát mặt tường. */}
                {this.guides.map((g, i) => (
                    <Line
                        key={`guide-${i}`}
                        points={[
                            g.x1 * PX_PER_WORLD + originX, g.z1 * PX_PER_WORLD + originY,
                            g.x2 * PX_PER_WORLD + originX, g.z2 * PX_PER_WORLD + originY,
                        ]}
                        stroke="#f8b400" strokeWidth={ss(2)} dash={[ss(8), ss(5)]} listening={false}
                    />
                ))}
                <Group x={cx} y={cy} opacity={0.6} perfectDrawEnabled={false}>
                    {img ? (
                        <>
                            <TopDownSprite image={img} url={this.topDownUrl} width={w} depth={d} />
                            {/* Phủ đỏ + viền đỏ khi va chạm — sprite không đổi màu trực tiếp được. */}
                            {bad && (
                                <Rect
                                    width={w} height={d}
                                    offsetX={w / 2} offsetY={d / 2}
                                    fill="rgba(200,30,30,0.38)"
                                    stroke="#c81e1e"
                                    strokeWidth={ss(2)}
                                />
                            )}
                        </>
                    ) : (
                        <Rect
                            width={w} height={d}
                            offsetX={w / 2} offsetY={d / 2}
                            fill={bad ? "rgba(200,30,30,0.22)" : "rgba(248,180,0,0.18)"}
                            stroke={bad ? "#c81e1e" : "#7c5800"}
                            strokeWidth={ss(1.5)}
                            dash={[ss(6), ss(4)]}
                        />
                    )}
                </Group>
                {/* Tâm thập tự nhỏ để thấy điểm snap */}
                <Rect x={cx - ss(5)} y={cy - ss(0.5)} width={ss(10)} height={ss(1)} fill={crossColor} />
                <Rect x={cx - ss(0.5)} y={cy - ss(5)} width={ss(1)} height={ss(10)} fill={crossColor} />
            </Layer>
        );
    }

    deactivate(): void {
        this.modelId = null;
        this.onComplete = null;
        this.ghost = null;
        this.guides = [];
        this.colliding = false;
    }
}
