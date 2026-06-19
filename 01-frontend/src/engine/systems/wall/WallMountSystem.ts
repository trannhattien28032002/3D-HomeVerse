/**
 * WallMountSystem — bám đồ-treo-tường (WallMounted / WallOpening) theo topology tường.
 *
 * Mỗi frame, suy lại (x, z, rotY) của từng item từ tham số bám (hostWallId, t, side)
 * + toạ độ node hiện tại. Nhờ vậy khi người dùng kéo một node tường, kệ/cửa tự trượt
 * theo mà không cần cập nhật thủ công — cùng triết lý "derived-from-topology" của tường.
 *
 * Y (cao độ) KHÔNG đổi theo node (node chỉ di chuyển trong mặt phẳng XZ) nên chỉ
 * cập nhật X/Z/yaw; giữ nguyên Transform.y đã đặt lúc spawn.
 *
 * Tối ưu: chỉ ghi + markDirty khi vị trí/hướng đổi quá EPS → tránh rebuild snapshot
 * mỗi frame một cách vô ích.
 *
 * Tường host bị xoá: ẩn model (root.visible=false) để không còn item "lơ lửng".
 * (Xoá hẳn entity là việc của REMOVE_WALL — sẽ bổ sung ở pha dọn-dẹp.)
 */
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { Transform } from "src/engine/components/core/Transform";
import { Model3D } from "src/engine/components/render/Model3D";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { findMountWall } from "src/engine/adapters/wallRefs";
import { wallItemPose } from "src/shared/geometry/wallMount";
import { setYawQuaternion } from "src/shared/math/yaw";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { GizmoHeld } from "src/engine/components/interaction/GizmoHeld";

const EPS = 1e-4;

export class WallMountSystem extends System {
    private readonly nodeReg: NodeRegistry;

    constructor(nodeRegistry: NodeRegistry) {
        super();
        this.nodeReg = nodeRegistry;
    }

    update(world: World): void {
        const mounted = Query.entitiesWith(world, WallMounted, Model3D, Transform);
        for (const e of mounted) {
            // Skip entity đang bị gizmo giữ — tránh xung đột quaternion với TransformControls.
            if (world.hasComponent(e, GizmoHeld)) continue;
            const wm = world.getComponent(e, WallMounted)!;
            const model = world.getComponent(e, Model3D)!;
            const t = world.getComponent(e, Transform)!;
            const wall = findMountWall(world, this.nodeReg, wm.hostWallId);
            if (!wall) { model.root.visible = false; continue; }
            model.root.visible = true;

            // Chỉ cần X/Z/yaw (Y giữ nguyên) → dims dùng displayHeight = 0 (bỏ qua baseY).
            const pose = wallItemPose(wall, wm.t, wm.side, resolveWallItemDims(model.modelId));
            this.applyIfChanged(world, model, t, pose.x, pose.z, pose.rotY);
        }

        const openings = Query.entitiesWith(world, WallOpening, Model3D, Transform);
        for (const e of openings) {
            // Skip entity đang bị gizmo giữ — tránh xung đột quaternion với TransformControls.
            if (world.hasComponent(e, GizmoHeld)) continue;
            const wo = world.getComponent(e, WallOpening)!;
            const model = world.getComponent(e, Model3D)!;
            const t = world.getComponent(e, Transform)!;
            const wall = findMountWall(world, this.nodeReg, wo.hostWallId);
            if (!wall) { model.root.visible = false; continue; }
            model.root.visible = true;

            // Cửa nhúng giữa tim tường (behavior "opening" → offset 0); side cố định +1 (đối xứng 2 mặt).
            const pose = wallItemPose(wall, wo.t, wo.side, resolveWallItemDims(model.modelId));
            this.applyIfChanged(world, model, t, pose.x, pose.z, pose.rotY);
        }
    }

    private applyIfChanged(
        world: World,
        model: Model3D,
        t: Transform,
        x: number,
        z: number,
        rotY: number,
    ): void {
        const changed =
            Math.abs(t.x - x) > EPS ||
            Math.abs(t.z - z) > EPS ||
            Math.abs(t.rotY - rotY) > EPS;
        if (!changed) return;

        t.x = x;
        t.z = z;
        t.rotY = rotY;
        model.root.position.x = x;
        model.root.position.z = z;
        setYawQuaternion(model.root, rotY);
        world.markDirty();
    }
}
