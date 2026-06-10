import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Mesh } from "src/engine/components/render/Mesh";
import { Selectable } from "src/engine/components/interaction/Selectable";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { Model3D } from "src/engine/components/render/Model3D";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { Transform } from "src/engine/components/core/Transform";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { snapAngleRad } from "src/shared/constants/placement";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import type { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import { findMountWall, findWallEntity } from "src/engine/adapters/wallRefs";
import { projectPointToWall, wallItemPose, wallNaturalRotY, occupancyLane, lanesConflict, wallItemOverlaps, type WallItemRange } from "src/shared/geometry/wallMount";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/**
 * gizmoHandles — các helper picking/ràng buộc dùng chung cho GizmoSystem.
 *
 * Tách khỏi GizmoSystem để file system gọn hơn: thu thập đối tượng có thể raycast,
 * ánh xạ hit → entity, và kiểm tra va chạm khi xoay. Mỗi mesh được gắn thuộc tính
 * `__entity` để truy ngược entity từ kết quả raycast của Three.js.
 */
export type MeshWithEntity = THREE.Object3D & { __entity?: string };

/** Đổ vào `into` mọi mesh có thể raycast trong world (loại trừ tường). */
export function collectPickTargets(world: World, into: THREE.Object3D[]): void {
    into.length = 0;

    const entities = Query.entitiesWith(world, Mesh, Selectable);
    for (const e of entities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const meshComp = world.getComponent(e, Mesh);
        if (!meshComp) continue;
        (meshComp.mesh as MeshWithEntity).__entity = e;
        into.push(meshComp.mesh);
    }

    const model3dEntities = Query.entitiesWith(world, Model3D, Selectable);
    for (const e of model3dEntities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const modelComp = world.getComponent(e, Model3D);
        if (!modelComp) continue;
        modelComp.root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                (child as MeshWithEntity).__entity = e;
                into.push(child as THREE.Mesh);
            }
        });
    }
}

/**
 * Ánh xạ một hit raycast về entity sở hữu + đối tượng Three.js để attach gizmo.
 * Trả về null khi object trúng không gắn entity nào.
 */
export function resolveHitEntity(
    hitObject: MeshWithEntity,
    world: World,
): { entityId: string; attachTarget: THREE.Object3D } | null {
    const entityId = hitObject.__entity ?? null;
    if (entityId == null) return null;

    const modelComp = world.getComponent(entityId, Model3D);
    if (modelComp) {
        (modelComp.root as MeshWithEntity).__entity = entityId;
        return { entityId, attachTarget: modelComp.root };
    }
    return { entityId, attachTarget: hitObject };
}

/**
 * Kiểm tra một phép xoay có gây va chạm không; nếu có thì hoàn lại quaternion cũ.
 * Đánh dấu world dirty khi phép xoay được chấp nhận.
 */
export function applyRotateCheck(
    controls: TransformControls,
    transform: Transform,
    collider: ColliderAABB | null,
    collisionSystem: CannonCollisionSystem,
    entity: string,
    world: World,
): void {
    const object = controls.object!;

    // Furniture chỉ xoay quanh Y: trích yaw, snap về bội số ROT_STEP_DEG, dựng lại
    // quaternion yaw-thuần. Đây vừa là hàng rào cuối sau setRotationSnap, vừa loại
    // bỏ pitch/roll nếu người dùng lỡ kéo vòng X/Z (xem R3 trong SNAP-M-AUDIT-PLAN).
    const yaw = snapAngleRad(2 * Math.atan2(object.quaternion.y, object.quaternion.w));
    const halfYaw = yaw / 2;
    object.quaternion.set(0, Math.sin(halfYaw), 0, Math.cos(halfYaw));
    const q = object.quaternion;

    if (!collider) {
        transform.setQuaternion(q.x, q.y, q.z, q.w);
        world.markDirty();
        return;
    }

    const blocked = collisionSystem.wouldCollideCustom(
        transform.x, transform.y, transform.z,
        collider.width * 2, collider.depth * 2, collider.height * 2,
        q.x, q.y, q.z, q.w,
        entity,
    );

    if (blocked) {
        object.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
    } else {
        transform.setQuaternion(q.x, q.y, q.z, q.w);
        world.markDirty();
    }
}

/** True nếu entity là đồ bám tường (cửa/cửa sổ khoét lỗ, hoặc kệ treo). */
export function isWallItem(world: World, entity: string): boolean {
    return world.hasComponent(entity, WallOpening) || world.hasComponent(entity, WallMounted);
}

/**
 * Trượt một wall-item dọc tường host theo điểm world (x,z):
 *   1. Chiếu (x,z) lên tim tường → ghi `t` (và `side` cho kệ) vào WallOpening/WallMounted
 *      (nguồn chân lý topology). `t` đã được projectPointToWall clamp khỏi 2 góc.
 *   2. Same-frame: ghim luôn Model3D.root vào tường bằng mountTransform → door KHÔNG trôi
 *      khi kéo vuông góc (WallMountSystem.applyIfChanged là EPS-gated nên không tự nắn lại
 *      nếu t không đổi). object gizmo attach chính là root nên gizmo + mesh luôn khớp.
 *
 * Trả false nếu thiếu tường host hoặc tường ngắn hơn cả item (giữ nguyên t cũ).
 * Chỉ chạm X/Z/yaw; Y (sill cho cửa, mountHeight cho kệ) giữ nguyên — gizmo đã khoá trục Y.
 */
export function slideWallItem(
    world: World,
    nodeReg: NodeRegistry,
    entity: string,
    x: number,
    z: number,
): { success: boolean; isOverlapping: boolean; intendedPose?: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number } } {
    const wo = world.getComponent(entity, WallOpening);
    const wm = world.getComponent(entity, WallMounted);
    const hostWallId = wo ? wo.hostWallId : wm!.hostWallId;
    const wall = findMountWall(world, nodeReg, hostWallId);
    if (!wall) return { success: false, isOverlapping: false };

    const model = world.getComponent(entity, Model3D)!;
    const halfWidth = getFootprint2D(model.modelId).width / 2;
    const { t, side, fits } = projectPointToWall(wall, x, z, halfWidth);
    if (!fits) return { success: false, isOverlapping: false };

    // Chống chồng lấn: kiểm tra t-range mới có overlap với items khác không.
    const wallLen = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) || 1e-6;
    const halfWidthT = halfWidth / wallLen;
    const occupied = collectOccupiedRanges(world, hostWallId, wallLen, entity);

    // Lane của item đang kéo: cửa (opening) chiếm cả hai mặt; kệ chiếm mặt theo con trỏ.
    const lane = occupancyLane(wo ? "opening" : "mount", wo ? wo.side : side);

    // Tìm vị trí an toàn (safeT) bằng cách đẩy ra khỏi vùng overlap CÙNG LANE.
    const safeT = clampTAgainstOccupied(t, halfWidthT, lane, occupied);
    const minT = halfWidth / wallLen;
    const maxT = 1 - minT;
    const finalSafeT = Math.max(minT, Math.min(safeT, maxT));
    // Tính overlap thật tại vị trí đã clamp, không so sánh t vs finalSafeT (sẽ false-positive
    // khi cửa chỉ bị đẩy ra mép tường bởi Math.max/min, không phải do overlap item khác).
    const isOverlapping = wallItemOverlaps(finalSafeT, halfWidthT, lane, occupied);

    if (wo) {
        wo.t = finalSafeT;                   // opening: giữ side hiện tại (flip qua gizmo rotate)
    } else {
        wm!.t = finalSafeT;                  // mount (kệ): đổi cả mặt theo con trỏ
        wm!.side = side;
    }

    // Ghim root thật vào tường theo finalSafeT
    const curSide = wo ? wo.side : wm!.side;
    const safePose = wallItemPose(wall, wo ? wo.t : wm!.t, curSide, resolveWallItemDims(model.modelId));
    model.root.position.x = safePose.x;
    model.root.position.z = safePose.z;
    const halfSafe = safePose.rotY / 2;
    model.root.quaternion.set(0, Math.sin(halfSafe), 0, Math.cos(halfSafe));

    // Vertical: CHỈ kệ (mount) được kéo lên/xuống dọc chiều cao tường (cửa giữ cao độ theo sill,
    // gizmo đã khoá trục Y). Gizmo (attach = root) đã đổi root.position.y theo thao tác kéo; ở
    // đây CLAMP đáy model trong [sàn, đỉnh tường] rồi đồng bộ mountHeight + Transform.y để bền
    // vững sau khi thả (WallMountSystem không động tới Y → giá trị này được giữ nguyên).
    if (wm) {
        const wallEnt = findWallEntity(world, hostWallId);
        const wallHeight = (wallEnt && world.getComponent(wallEnt, WallSize)?.height) || Infinity;
        const bbox = new THREE.Box3().setFromObject(model.root);
        const h = bbox.max.y - bbox.min.y;
        const maxBottom = Math.max(0, wallHeight - h);
        const desiredBottom = Math.min(Math.max(bbox.min.y, 0), maxBottom);
        model.root.position.y += desiredBottom - bbox.min.y;
        const centerY = desiredBottom + h / 2;
        wm.mountHeight = centerY;
        const tr = world.getComponent(entity, Transform);
        if (tr) tr.y = centerY;
    }

    // Tính pose gốc để báo cho ghost (nếu bị overlap)
    let intendedPose = undefined;
    if (isOverlapping) {
        const iPose = wallItemPose(wall, t, curSide, resolveWallItemDims(model.modelId));
        const iHalf = iPose.rotY / 2;
        intendedPose = {
            x: iPose.x,
            y: model.root.position.y, // Giữ Y như cũ (vì baseY offset đã áp dụng vào root.position.y lúc spawn)
            z: iPose.z,
            qx: 0,
            qy: Math.sin(iHalf),
            qz: 0,
            qw: Math.cos(iHalf),
        };
    }

    return { success: true, isOverlapping, intendedPose };
}

/**
 * Clamp `t` sao cho khoảng (t - halfT, t + halfT) không cắt qua vùng occupied XUNG ĐỘT LANE.
 * Range khác lane (kệ mặt bên kia) bị bỏ qua → không đẩy item ra vô cớ.
 * Snap qua bên kia dựa vào vị trí tương đối của t so với tâm range — không snap lùi về phía cũ.
 */
function clampTAgainstOccupied(t: number, halfT: number, lane: number, occupied: WallItemRange[]): number {
    for (const r of occupied) {
        if (!lanesConflict(lane, r.lane)) continue; // khác mặt → không cản
        const ghostMin = t - halfT;
        const ghostMax = t + halfT;
        if (ghostMax <= r.tMin || ghostMin >= r.tMax) continue; // không overlap
        const tMid = (r.tMin + r.tMax) / 2;
        // Snap qua bên kia tâm range theo hướng con trỏ đang tiến vào.
        t = t >= tMid ? r.tMax + halfT : r.tMin - halfT;
    }
    return t;
}

/**
 * Flip wall item 180° qua gizmo rotate: so sánh yaw mà gizmo đặt với hướng
 * tường tự nhiên (side=+1). Nếu delta > 90° → flip side.
 * Snap quaternion của object về đúng wall-derived rotY (không cho xoay tự do).
 */
export function flipWallItemByGizmo(
    world: World,
    nodeReg: NodeRegistry,
    entity: string,
    object: THREE.Object3D,
): void {
    const wo = world.getComponent(entity, WallOpening);
    const wm = world.getComponent(entity, WallMounted);
    const hostWallId = wo ? wo.hostWallId : wm!.hostWallId;
    const wall = findMountWall(world, nodeReg, hostWallId);
    if (!wall) return;

    // Yaw mà gizmo rotate đặt lên object — dùng công thức Euler Y đúng để tránh sai lệch
    // khi quaternion có thành phần X/Z nhỏ do gizmo gây ra.
    const { x: qx, y: qy, z: qz, w: qw } = object.quaternion;
    const intendedYaw = Math.atan2(
        2 * (qw * qy - qz * qx),
        1 - 2 * (qy * qy + qz * qz),
    );

    // Hướng tường tự nhiên cho side = +1.
    const wallRotY0 = wallNaturalRotY(wall);

    // Delta chuẩn hoá về [-π, π].
    let delta = intendedYaw - wallRotY0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    // |delta| < 90° → side +1; ngược lại → side -1 (flip 180°).
    const newSide = Math.abs(delta) < Math.PI / 2 ? 1 : -1;

    if (wo) wo.side = newSide;
    else wm!.side = newSide;

    // Không snap quaternion ở đây — gizmo cần giữ tự do xoay để delta tích lũy.
    // WallMountSystem đang bị skip (GizmoHeld) nên sẽ không reset; snap về wall-derived
    // rotY được thực hiện tại dragEnd trong GizmoSystem.

    world.markDirty();
}

// ---------------------------------------------------------------------------
// Helpers nội bộ
// ---------------------------------------------------------------------------

/**
 * Gom t-range của mọi wall item trên cùng tường (trừ entity đang kéo).
 * wallLen (mét) dùng để chuyển width → halfWidthT.
 */
export function collectOccupiedRanges(
    world: World,
    hostWallId: string,
    wallLen: number,
    excludeEntity: string,
): WallItemRange[] {
    const ranges: WallItemRange[] = [];
    for (const e of Query.entitiesWith(world, WallOpening)) {
        if (e === excludeEntity) continue;
        const wo = world.getComponent(e, WallOpening)!;
        if (wo.hostWallId !== hostWallId) continue;
        const halfT = (wo.width / 2) / wallLen;
        ranges.push({ tMin: wo.t - halfT, tMax: wo.t + halfT, lane: occupancyLane("opening", wo.side) });
    }
    for (const e of Query.entitiesWith(world, WallMounted)) {
        if (e === excludeEntity) continue;
        const wm = world.getComponent(e, WallMounted)!;
        if (wm.hostWallId !== hostWallId) continue;
        const model = world.getComponent(e, Model3D);
        if (!model) continue;
        const halfT = (getFootprint2D(model.modelId).width / 2) / wallLen;
        ranges.push({ tMin: wm.t - halfT, tMax: wm.t + halfT, lane: occupancyLane("mount", wm.side) });
    }
    return ranges;
}

/** Đường gióng wall-snap (sát sàn) để vẽ. */
type AlignGuide = { x1: number; z1: number; x2: number; z2: number };

/** Ngữ cảnh kéo furniture-thường (translate), gom các phụ thuộc từ GizmoSystem. */
export interface FurnitureTranslateCtx {
    world: World;
    entity: string;
    object: THREE.Object3D;
    transform: Transform;
    collider: ColliderAABB | null;
    collisionSystem: CannonCollisionSystem;
    dragGhost: DragGhostController;
    wallSegments: WallSegment[];
    neighbors: FurnitureBox[];
    updateGuide: (guides: AlignGuide[]) => void;
}

/**
 * Di chuyển furniture-thường khi kéo gizmo (translate). Tách từ GizmoSystem.objectChange:
 *   1. Snap vị trí qua nguồn chân lý chung resolveAlignment (edge-snap + wall-snap, OBB-aware).
 *   2. Trống → "teleport" tới con trỏ + ẩn ghost; Đụng → clamp tại vật cản, ghost lơ lửng ở con trỏ.
 *
 * GLB lấy pivot đáy-mesh (object.position.y = đáy) còn Transform/va chạm dùng tâm-AABB → cộng halfH.
 */
export function handleFurnitureTranslate(ctx: FurnitureTranslateCtx): void {
    const { world, entity, object, transform, collider, collisionSystem, dragGhost } = ctx;
    const q = object.quaternion;
    const halfH = (world.hasComponent(entity, Model3D) && collider) ? collider.height : 0;

    const yaw = 2 * Math.atan2(q.y, q.w);
    const aligned = resolveAlignment({
        cx: object.position.x,
        cz: object.position.z,
        hw: collider ? collider.width : 0,
        hd: collider ? collider.depth : 0,
        rotY: yaw,
        walls: ctx.wallSegments,
        neighbors: ctx.neighbors,
    });
    ctx.updateGuide(aligned.guides);

    const ix = aligned.x;
    const iy = object.position.y;
    const iz = aligned.z;
    const adjustedY = iy + halfH; // tâm-AABB cho va chạm/transform

    if (!collisionSystem.wouldCollide(world, entity, ix, adjustedY, iz)) {
        // Vị trí mong muốn trống — vật "teleport" tới con trỏ.
        transform.x = ix;
        transform.y = adjustedY;
        transform.z = iz;
        object.position.x = ix; // ghi lại vì không còn translationSnap để gizmo tự bám lưới
        object.position.z = iz;
        collisionSystem.setSafePos(entity, ix, adjustedY, iz);
        dragGhost.hide();
    } else {
        // Vị trí mong muốn bị đụng — dừng vật ở vật cản, ghost lơ lửng ở con trỏ.
        const clamped = collisionSystem.clampMovement(world, entity, ix, adjustedY, iz);
        if (clamped) {
            transform.x = clamped.x;
            transform.y = clamped.y;
            transform.z = clamped.z;
            object.position.set(clamped.x, clamped.y - halfH, clamped.z); // tâm-AABB → đáy-mesh
        } else {
            transform.x = ix;
            transform.y = adjustedY;
            transform.z = iz;
        }
        // Ghost clone đặt ở đáy-mesh → truyền iy (không phải adjustedY) để nằm phẳng trên sàn.
        dragGhost.update({ x: ix, y: iy, z: iz, qx: q.x, qy: q.y, qz: q.z, qw: q.w }, true);
    }

    transform.setQuaternion(q.x, q.y, q.z, q.w);
    world.markDirty(); // SnapshotSystem rebuild + hộp 2D bám theo
}
