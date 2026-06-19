/**
 * GizmoDragLifecycle — máy trạng thái VÒNG ĐỜI kéo gizmo, tách khỏi GizmoSystem
 * (Phase 5.4, bước 3/3 — phần phức tạp nhất: body-swap dễ rò nên làm cuối).
 *
 * Trách nhiệm:
 *   - dragging-changed: bắt đầu → tắt orbit, mở transaction, Static→Dynamic (trừ wall-item),
 *     bật drag-ghost + gom segments tường/đồ lân cận; kết thúc → dọn ghost/guide/marker,
 *     đóng transaction, hẹn trả StaticBody sau RELEASE_FRAMES.
 *   - update(): đếm ngược release-frames để gỡ DynamicBody / phục hồi StaticBody; guard
 *     entity bị xoá giữa lúc kéo (undo) → dọn state.
 *
 * Sở hữu state body-swap (draggingEntity/draggingEntityWasStatic/releaseFramesLeft) +
 * drag-context (dragWallSegments/dragFurnitureBoxes — GizmoSystem.onObjectChange đọc cho
 * furniture-translate). Mọi thứ khác đọc/gọi qua {@link GizmoContext}.
 */
import { type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { readEntity, isWallItem } from "src/engine/systems/gizmo/gizmoHandles";
import { GizmoHeld } from "src/engine/components/interaction/GizmoHeld";
import { Transform } from "src/engine/components/core/Transform";
import { DynamicBody } from "src/engine/components/physics/DynamicBody";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import { quatToYaw } from "src/shared/math/yaw";
import type { GizmoContext } from "src/engine/systems/gizmo/gizmoContext";

/**
 * Số frame trễ giữa lúc thả gizmo và lúc gỡ DynamicBody / phục hồi static.
 * Để vật lý settle 1–2 frame sau drag trước khi đổi loại body (tránh giật).
 */
const RELEASE_FRAMES = 2;

export class GizmoDragLifecycle {
    private readonly ctx: GizmoContext;
    /** OrbitControls của scene — tắt khi đang kéo gizmo để không xoay camera. */
    private readonly orbitControls: OrbitControls;

    private draggingEntity: string | null = null;
    private draggingEntityWasStatic = false;
    private releaseFramesLeft = 0;

    /** Segments tường gom 1 lần khi bắt đầu kéo (tường tĩnh trong lúc kéo). Đọc bởi onObjectChange. */
    dragWallSegments: WallSegment[] = [];
    /** Footprint đồ lân cận gom 1 lần khi bắt đầu kéo (cho neighbor-align). Đọc bởi onObjectChange. */
    dragFurnitureBoxes: FurnitureBox[] = [];

    constructor(ctx: GizmoContext, orbitControls: OrbitControls) {
        this.ctx = ctx;
        this.orbitControls = orbitControls;
    }

    /**
     * TransformControls bắt đầu / kết thúc kéo.
     *  - Bắt đầu: tắt orbit, mở transaction, chuyển StaticBody→DynamicBody (trừ wall-item),
     *    bật drag-ghost + gom segments tường/đồ lân cận cho snap.
     *  - Kết thúc: dọn ghost/guide, đóng transaction, hẹn trả lại StaticBody sau vài frame.
     */
    onDraggingChanged = (event: { value?: unknown }): void => {
        const { controls, dragGhost, events } = this.ctx;
        const world = this.ctx.world;
        const isDragging = Boolean(event.value);
        this.orbitControls.enabled = !isDragging;

        const object = controls.object;
        const entity = readEntity(object);

        if (isDragging) {
            if (entity == null) return;

            const label = this.ctx.mode === "rotate"
                ? "rotate furniture 3D"
                : "move furniture 3D";
            this.ctx.beginTransaction(label);

            this.draggingEntity = entity;

            // Wall-item (cửa/kệ): không có collider (Physics AABB) → không swap body,
            // và không cần gom wall segments cho alignment (vì bám thẳng trên tường).
            if (isWallItem(world, entity)) {
                this.draggingEntityWasStatic = false;
                this.releaseFramesLeft = 0;
                // Đánh dấu để WallMountSystem không ghi đè quaternion trong lúc kéo.
                world.addComponent(entity, new GizmoHeld());
                if (this.ctx.mode === "translate") {
                    dragGhost?.begin(world, entity);
                }
                events?.emit("draggingChanged", { entityId: entity, dragging: true });
                return;
            }

            this.draggingEntityWasStatic = world.hasComponent(entity, StaticBody);
            this.releaseFramesLeft = 0;

            if (this.draggingEntityWasStatic) {
                world.removeComponent(entity, StaticBody);
            }
            if (!world.hasComponent(entity, DynamicBody)) {
                world.addComponent(entity, new DynamicBody());
            }

            // Chế độ xoay không dùng ghost — vật xoay tại chỗ.
            if (this.ctx.mode === "translate") {
                dragGhost?.begin(world, entity);
                // Gom tường + đồ lân cận 1 lần (tĩnh trong lúc kéo) cho snap.
                this.dragWallSegments = collectWallSegments(world, this.ctx.nodeRegistry);
                this.dragFurnitureBoxes = collectFurnitureBoxes(world, entity);
            } else {
                // Rotate "vô-lăng": chốt yaw gốc + góc con trỏ gốc làm mốc cộng dồn.
                const tr = world.getComponent(entity, Transform);
                const startYaw = tr ? quatToYaw(tr.qx, tr.qy, tr.qz, tr.qw) : 0;
                this.ctx.pointerRotate.begin(object!, startYaw);
            }
            events?.emit("draggingChanged", { entityId: entity, dragging: true });
            return;
        }

        if (this.draggingEntity == null) return;

        // Wall-item: không tạo ghost/body → commit + emit + dọn marker, không cần release frames.
        if (isWallItem(world, this.draggingEntity)) {
            const e = this.draggingEntity;
            // Xoá marker để WallMountSystem tiếp tục cập nhật entity.
            if (world.hasComponent(e, GizmoHeld)) {
                world.removeComponent(e, GizmoHeld);
            }
            // Sau rotate: snap quaternion về wall-derived rotY theo side đã flip.
            if (this.ctx.mode === "rotate") {
                this.ctx.snapWallItemRotation(e);
            }
            // Sau translate: dọn ghost (ghost được tạo ở drag-start cho translate).
            if (this.ctx.mode === "translate") {
                dragGhost?.end();
            }
            this.ctx.clearOpeningPreview();
            this.ctx.commitTransaction();
            events?.emit("draggingChanged", { entityId: e, dragging: false });
            this.draggingEntity = null;
            return;
        }
        // Ghost không hề khởi tạo ở chế độ xoay — chỉ dọn dẹp ở chế độ translate.
        if (this.ctx.mode === "translate") {
            dragGhost?.end();
        }
        this.ctx.hideGuide();
        this.dragWallSegments = [];
        this.dragFurnitureBoxes = [];
        this.ctx.commitTransaction();
        this.releaseFramesLeft = RELEASE_FRAMES;
        events?.emit("draggingChanged", { entityId: this.draggingEntity, dragging: false });
    };

    /**
     * Mỗi frame: guard entity bị xoá giữa lúc kéo (undo) + đếm ngược release-frames để
     * trả entity về StaticBody. `ctx.world` đã được GizmoSystem.update set trước khi gọi.
     */
    update(): void {
        const world = this.ctx.world;

        // Guard: entity bị xoá giữa lúc kéo (ví dụ undo) — dọn ghost + marker.
        if (this.draggingEntity != null && !world.hasComponent(this.draggingEntity, Transform)) {
            this.ctx.dragGhost?.end();
            // GizmoHeld đã gắn nhưng entity biến mất → không thể removeComponent; chỉ clear state.
            this.draggingEntity = null;
            this.draggingEntityWasStatic = false;
            this.releaseFramesLeft = 0;
        }

        if (this.releaseFramesLeft > 0) {
            this.releaseFramesLeft--;
            if (this.releaseFramesLeft === 0 && this.draggingEntity != null) {
                const e = this.draggingEntity;

                if (world.hasComponent(e, DynamicBody)) {
                    world.removeComponent(e, DynamicBody);
                }
                if (
                    this.draggingEntityWasStatic &&
                    !world.hasComponent(e, StaticBody)
                ) {
                    world.addComponent(e, new StaticBody());
                }

                this.draggingEntity = null;
                this.draggingEntityWasStatic = false;
            }
        }
    }
}
