/**
 * WallItemGizmoAdapter — toàn bộ ứng xử RIÊNG của wall-item (cửa/cửa sổ/kệ) khi thao tác
 * gizmo, tách khỏi GizmoSystem (Phase 5.4, bước 2/3).
 *
 * Gom 4 mảnh wall-item rải trong GizmoSystem về một chỗ:
 *   - onObjectChange (nhánh wall-item): rotate→flip side; translate→trượt dọc tường (t/side)
 *     + ghim mesh + ghost khi đè + CSG opening preview.
 *   - snapWallItemRotation: kết drag rotate → snap quaternion về wall-derived rotY.
 *   - applyGizmoAxes: bật/tắt trục gizmo theo loại (cửa khoá Y, kệ cho kéo Y).
 *   - updateOpeningPreview: preview CSG khoét tường cho door/window khi kéo.
 *
 * Đọc/gọi mọi thứ qua {@link GizmoContext} (controls/world/mode/nodeRegistry/dragGhost),
 * sở hữu riêng WallOpeningPreviewController.
 */
import * as THREE from "three";
import {
    isWallItem,
    slideWallItem,
    flipWallItemByGizmo,
} from "src/engine/systems/gizmo/gizmoHandles";
import { getWallItemTopology } from "src/engine/adapters/wallItemTopology";
import { wallNaturalRotY } from "src/shared/geometry/wallMount";
import { findMountWall } from "src/engine/adapters/wallRefs";
import { setYawQuaternion } from "src/shared/math/yaw";
import {
    WallOpeningPreviewController,
    collectExistingOpenings,
} from "src/engine/systems/wall/WallOpeningPreviewController";
import { Model3D } from "src/engine/components/render/Model3D";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Mesh } from "src/engine/components/render/Mesh";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { Query } from "src/engine/ecs/Query";
import type { GizmoContext } from "src/engine/systems/gizmo/gizmoContext";

export class WallItemGizmoAdapter {
    private readonly ctx: GizmoContext;
    /** Preview CSG tường cho door/window khi kéo gizmo (begin-vs-update qua controller). */
    private readonly openingPreview: WallOpeningPreviewController;

    constructor(ctx: GizmoContext, scene: THREE.Scene) {
        this.ctx = ctx;
        this.openingPreview = new WallOpeningPreviewController(scene);
    }

    /**
     * Nhánh wall-item của objectChange. Caller (GizmoSystem) đã xác nhận entity là wall-item.
     * Rotate: lật side (hướng do tường quyết định → no slide). Translate: trượt dọc tường
     * (t/side) + ghim mesh + ghost khi đè + CSG preview cho cửa.
     */
    handleObjectChange(entity: string, object: THREE.Object3D): void {
        const { world, nodeRegistry, dragGhost } = this.ctx;
        if (this.ctx.mode === "rotate") {
            flipWallItemByGizmo(world, nodeRegistry, entity, object);
            return;
        }
        const result = slideWallItem(world, nodeRegistry, entity, object.position.x, object.position.z);
        if (result.success) {
            world.markDirty();
            if (result.isOverlapping && result.intendedPose) {
                dragGhost?.update(result.intendedPose, true);
            } else {
                dragGhost?.hide();
            }
            // CSG preview cho door/window khi kéo gizmo.
            const wo = world.getComponent(entity, WallOpening);
            if (wo) {
                this.updateOpeningPreview(wo.hostWallId, wo.t, wo.width, wo.height, wo.sill, entity);
            }
        }
    }

    /**
     * Snap quaternion của wall-item về wall-derived rotY theo side hiện tại.
     * Gọi khi kết thúc drag rotate để xác nhận chiều quay cuối cùng.
     */
    snapWallItemRotation(entity: string): void {
        const { world, nodeRegistry } = this.ctx;
        const topo = getWallItemTopology(world, entity);
        if (!topo) return;
        const wall = findMountWall(world, nodeRegistry, topo.hostWallId);
        if (!wall) return;
        const side = topo.side;
        const wallRotY0 = wallNaturalRotY(wall);
        const rotY = side === 1 ? wallRotY0 : wallRotY0 + Math.PI;
        const model = world.getComponent(entity, Model3D);
        if (!model) return;
        setYawQuaternion(model.root, rotY);
        world.markDirty();
    }

    /**
     * Bật/tắt trục gizmo theo loại entity + mode hiện tại:
     *   - Furniture thường: đủ X/Y/Z.
     *   - Wall-item + rotate: CHỈ trục Y (lật đối xứng cửa / đổi mặt kệ) — cấm nghiêng X/Z.
     *   - Wall-item + translate: trượt dọc tường (X/Z, sẽ chiếu về tim tường); kệ (mount)
     *     thêm Y để kéo lên/xuống đổi cao độ, cửa/cửa sổ khoá Y (cao độ theo sill).
     */
    applyGizmoAxes(entity: string): void {
        const { controls, world } = this.ctx;
        if (!isWallItem(world, entity)) {
            controls.showX = true;
            controls.showY = true;
            controls.showZ = true;
            return;
        }
        if (this.ctx.mode === "rotate") {
            controls.showX = false;
            controls.showY = true;
            controls.showZ = false;
            return;
        }
        const isOpening = world.hasComponent(entity, WallOpening);
        controls.showX = true;
        controls.showZ = true;
        controls.showY = !isOpening; // kệ cho kéo lên/xuống; cửa giữ cao độ
    }

    /** Dọn CSG opening preview của tường. */
    clearOpeningPreview(): void {
        this.openingPreview.clear();
    }

    /**
     * Cập nhật preview CSG tường khi kéo gizmo door/window.
     * Resolve mesh/poly/size + wall theo hostWallId rồi uỷ cho controller quyết định
     * begin-vs-update.
     */
    private updateOpeningPreview(
        hostWallId: string,
        t: number,
        cutWidth: number,
        cutHeight: number,
        sill: number,
        excludeEntity: string,
    ): void {
        const { world, nodeRegistry } = this.ctx;
        let wallEntity: string | undefined;
        for (const e of Query.entitiesWith(world, WallTag, WallNodes)) {
            const tag = world.getComponent(e, WallTag);
            if (tag?.wallId === hostWallId) { wallEntity = e; break; }
        }
        if (!wallEntity) return;

        const meshComp = world.getComponent(wallEntity, Mesh);
        const poly = world.getComponent(wallEntity, WallPolygon);
        const size = world.getComponent(wallEntity, WallSize);
        if (!meshComp || !poly || !size) return;

        const wall = findMountWall(world, nodeRegistry, hostWallId);
        if (!wall) return;

        this.openingPreview.update({
            wallId: hostWallId,
            wallMesh: meshComp.mesh,
            poly: poly.points,
            wallHeight: size.height,
            wall,
            existingOpenings: collectExistingOpenings(world, hostWallId, excludeEntity),
            ghostOpening: { t, width: cutWidth, height: cutHeight, sill },
        });
    }
}
