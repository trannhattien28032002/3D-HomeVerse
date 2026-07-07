import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Mesh } from "src/engine/components/render/Mesh";
import { Selectable } from "src/engine/components/interaction/Selectable";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallTag } from "src/engine/components/wall/WallTag";
import { Model3D } from "src/engine/components/render/Model3D";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { Transform } from "src/engine/components/core/Transform";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { snapAngleRad } from "src/shared/constants/placement";
import { quatToYaw, setYawQuaternion } from "src/shared/math/yaw";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import type { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import { findMountWall, findWallEntity } from "src/engine/adapters/wallRefs";
import { getWallItemTopology, setWallItemTopology } from "src/engine/adapters/wallItemTopology";
import { projectPointToWall, wallItemPose, wallNaturalRotY, occupancyLane, resolveWallItemT } from "src/shared/geometry/wallMount";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { collectOccupiedRanges } from "src/engine/utils/wallItemRanges";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/**
 * gizmoHandles — các helper picking/ràng buộc dùng chung cho GizmoSystem.
 *
 * Tách khỏi GizmoSystem để file system gọn hơn: thu thập đối tượng có thể raycast,
 * ánh xạ hit → entity, và kiểm tra va chạm khi xoay. Mỗi mesh được gắn thuộc tính
 * `__entity` để truy ngược entity từ kết quả raycast của Three.js.
 */
export type MeshWithEntity = THREE.Object3D & { __entity?: string };

/** Mesh tường có gắn ngược wallId để truy ngược từ kết quả raycast (chọn đổi material). */
export type WallPickMesh = THREE.Object3D & { __wallId?: string };

/** Mesh sàn phòng có gắn ngược roomKey để truy ngược từ raycast (chọn đổi material sàn). */
export type RoomPickMesh = THREE.Object3D & { __roomKey?: string };

// ── Thẻ truy-ngược trên Object3D ─────────────────────────────────────────────
// Gom mọi `as MeshWithEntity/WallPickMesh/RoomPickMesh` về một bộ helper: gắn
// (tag*) khi build pick-target, đọc (read*) khi xử lý kết quả raycast.

/** Gắn entityId vào Object3D để raycast truy ngược. */
export function tagEntity(obj: THREE.Object3D, entityId: string): void {
    (obj as MeshWithEntity).__entity = entityId;
}
/** Đọc entityId đã gắn (null nếu object không có thẻ / là null). */
export function readEntity(obj: THREE.Object3D | null | undefined): string | null {
    return (obj as MeshWithEntity | null | undefined)?.__entity ?? null;
}
/** Gắn wallId vào mesh tường để raycast truy ngược. */
export function tagWallId(obj: THREE.Object3D, wallId: string): void {
    (obj as WallPickMesh).__wallId = wallId;
}
/** Đọc wallId đã gắn (null nếu không có). */
export function readWallId(obj: THREE.Object3D | null | undefined): string | null {
    return (obj as WallPickMesh | null | undefined)?.__wallId ?? null;
}
/** Gắn roomKey vào mesh sàn để raycast truy ngược. */
export function tagRoomKey(obj: THREE.Object3D, roomKey: string): void {
    (obj as RoomPickMesh).__roomKey = roomKey;
}
/** Đọc roomKey đã gắn (null nếu không có). */
export function readRoomKey(obj: THREE.Object3D | null | undefined): string | null {
    return (obj as RoomPickMesh | null | undefined)?.__roomKey ?? null;
}

/**
 * Đổ vào `into` mọi mesh tường có WallTag, gắn `__wallId` để truy ngược.
 * Dùng cho raycast chọn tường (chỉ để đổi material — KHÔNG attach gizmo).
 */
export function collectWallPickTargets(world: World, into: THREE.Object3D[]): void {
    into.length = 0;
    for (const e of Query.entitiesWith(world, Mesh, WallNodes, WallTag)) {
        const meshComp = world.getComponent(e, Mesh);
        const tag = world.getComponent(e, WallTag);
        if (!meshComp || !tag) continue;
        tagWallId(meshComp.mesh, tag.wallId);
        into.push(meshComp.mesh);
    }
}

/**
 * Đổ vào `into` mọi mesh sàn phòng (lấy từ MeshRegistry theo `room-${entity}`),
 * gắn `__roomKey` = RoomGeometry.key để truy ngược. Dùng cho raycast chọn sàn
 * (chỉ để đổi material — KHÔNG attach gizmo). Sàn không có component Mesh nên
 * phải tra qua MeshRegistry thay vì Query Mesh như tường.
 */
export function collectRoomPickTargets(world: World, meshRegistry: MeshRegistry, into: THREE.Object3D[]): void {
    into.length = 0;
    for (const e of Query.entitiesWith(world, RoomGeometry)) {
        const geo = world.getComponent(e, RoomGeometry);
        if (!geo) continue;
        const mesh = meshRegistry.get(`room-${e}`);
        if (!mesh) continue;
        tagRoomKey(mesh, geo.key);
        into.push(mesh);
    }
}

/** Đổ vào `into` mọi mesh có thể raycast trong world (loại trừ tường). */
export function collectPickTargets(world: World, into: THREE.Object3D[]): void {
    into.length = 0;

    const entities = Query.entitiesWith(world, Mesh, Selectable);
    for (const e of entities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const meshComp = world.getComponent(e, Mesh);
        if (!meshComp) continue;
        tagEntity(meshComp.mesh, e);
        into.push(meshComp.mesh);
    }

    const model3dEntities = Query.entitiesWith(world, Model3D, Selectable);
    for (const e of model3dEntities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const modelComp = world.getComponent(e, Model3D);
        if (!modelComp) continue;
        modelComp.root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                tagEntity(child, e);
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
    hitObject: THREE.Object3D,
    world: World,
): { entityId: string; attachTarget: THREE.Object3D } | null {
    const entityId = readEntity(hitObject);
    if (entityId == null) return null;

    const modelComp = world.getComponent(entityId, Model3D);
    if (modelComp) {
        tagEntity(modelComp.root, entityId);
        return { entityId, attachTarget: modelComp.root };
    }
    return { entityId, attachTarget: hitObject };
}

/** Mảng scratch tái dùng cho 3 nhóm raycast (do GizmoSystem sở hữu). */
export interface PickScratch {
    furniture: THREE.Object3D[];
    wall: THREE.Object3D[];
    room: THREE.Object3D[];
}

/**
 * Kết quả phân giải một click chuột trái trong khung 3D.
 *  - none: không trúng gì (hoặc trúng object không gắn entity) → bỏ chọn.
 *  - floor/wall: chỉ để chọn đổi material → KHÔNG attach gizmo.
 *  - furniture: attach gizmo để di chuyển/xoay.
 */
export type PickResult =
    | { kind: "none" }
    | { kind: "floor"; roomKey: string | null }
    | { kind: "wall"; wallId: string | null }
    | { kind: "furniture"; entityId: string; attachTarget: THREE.Object3D };

/**
 * Phân giải pick theo thứ tự ưu tiên sàn < tường < furniture (theo khoảng cách).
 * Gom 3 nhóm target + raycast + so sánh distance về một chỗ; GizmoSystem chỉ việc
 * phát đúng event / attach theo kết quả.
 *
 * Sàn luôn nằm dưới đồ/tường nên khi click trúng đồ/tường, hit của chúng gần camera
 * hơn → sàn không "cướp" click dù được raycast riêng.
 */
export function resolvePick(
    raycaster: THREE.Raycaster,
    world: World,
    meshRegistry: MeshRegistry,
    scratch: PickScratch,
): PickResult {
    // recursive=true để Three.js bắt được cả mesh con bên trong Group GLB.
    collectPickTargets(world, scratch.furniture);
    const furnitureHits = raycaster.intersectObjects(scratch.furniture, true);

    // Tường + sàn raycast riêng (collectPickTargets loại trừ tường) — chỉ để đổi material.
    collectWallPickTargets(world, scratch.wall);
    const wallHits = raycaster.intersectObjects(scratch.wall, false);

    collectRoomPickTargets(world, meshRegistry, scratch.room);
    const roomHits = raycaster.intersectObjects(scratch.room, false);

    const furnitureDist = furnitureHits[0]?.distance ?? Infinity;
    const wallDist = wallHits[0]?.distance ?? Infinity;
    const roomDist = roomHits[0]?.distance ?? Infinity;

    if (furnitureDist === Infinity && wallDist === Infinity && roomDist === Infinity) {
        return { kind: "none" };
    }
    if (roomDist < furnitureDist && roomDist < wallDist) {
        return { kind: "floor", roomKey: readRoomKey(roomHits[0].object) };
    }
    if (wallDist < furnitureDist) {
        return { kind: "wall", wallId: readWallId(wallHits[0].object) };
    }
    const resolved = resolveHitEntity(furnitureHits[0].object, world);
    if (!resolved) return { kind: "none" };
    return { kind: "furniture", entityId: resolved.entityId, attachTarget: resolved.attachTarget };
}

/**
 * Áp một phép xoay (yaw thô, radian) lên entity: snap 15°, kiểm tra va chạm;
 * nếu đụng thì hoàn lại quaternion cũ. Đánh dấu world dirty khi được chấp nhận.
 *
 * `rawYaw` do GizmoSystem tự tính từ GÓC CON TRỎ quanh tâm vật (xem
 * `computePointerYaw`), KHÔNG trích từ `object.quaternion`. Lý do: rotate 1 trục
 * của TransformControls tính góc bằng phép chiếu tuyến tính của độ dịch con trỏ
 * (`_offset.dot(tangent)`), nên kéo gần trọn vòng sẽ co `_offset` về 0 → vật tự
 * xoay ngược lại. Tính yaw từ góc con trỏ (kiểu vô-lăng) thì đơn điệu, không đảo.
 */
export function applyRotateCheck(
    controls: TransformControls,
    transform: Transform,
    collider: ColliderAABB | null,
    collisionSystem: CannonCollisionSystem,
    entity: string,
    world: World,
    rawYaw: number,
): void {
    const object = controls.object!;

    // Furniture chỉ xoay quanh Y: snap về bội số ROT_STEP_DEG, dựng lại quaternion
    // yaw-thuần (loại bỏ pitch/roll). Hàng rào cuối sau setRotationSnap.
    const yaw = snapAngleRad(rawYaw);
    setYawQuaternion(object, yaw);
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
    // `entity` là tham số (không lọc qua Query) → đọc topology qua accessor (opening/mount
    // chung một đường, không non-null `!` ở nhánh mount). (M6 + Phase 5.1)
    const topo = getWallItemTopology(world, entity);
    if (!topo) return { success: false, isOverlapping: false };
    const hostWallId = topo.hostWallId;
    const wall = findMountWall(world, nodeReg, hostWallId);
    if (!wall) return { success: false, isOverlapping: false };

    const model = world.getComponent(entity, Model3D);
    if (!model) return { success: false, isOverlapping: false };
    const halfWidth = getFootprint2D(model.modelId).width / 2;
    const { t, side, fits } = projectPointToWall(wall, x, z, halfWidth);
    if (!fits) return { success: false, isOverlapping: false };

    // Chống chồng lấn: kiểm tra t-range mới có overlap với items khác không.
    const wallLen = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) || 1e-6;
    const halfWidthT = halfWidth / wallLen;
    const occupied = collectOccupiedRanges(world, hostWallId, wallLen, entity);

    const isOpening = topo.kind === "opening";
    // Lane của item đang kéo: cửa (opening) chiếm cả hai mặt; kệ chiếm mặt theo con trỏ.
    const lane = occupancyLane(isOpening ? "opening" : "mount", isOpening ? topo.side : side);

    // Policy "snap": đẩy item ra khỏi vùng đè cùng lane rồi clamp biên. overlap tính tại t
    // cuối (không so t vs safeT — tránh false-positive khi chỉ bị đẩy ra mép tường).
    const minT = halfWidth / wallLen;
    const maxT = 1 - minT;
    const { t: finalSafeT, overlapping: isOverlapping } =
        resolveWallItemT(t, halfWidthT, minT, maxT, lane, occupied, "snap");

    // opening: giữ side hiện tại (flip qua gizmo rotate); mount (kệ): đổi cả mặt theo con trỏ.
    const curSide = isOpening ? topo.side : side;
    setWallItemTopology(world, entity, isOpening ? { t: finalSafeT } : { t: finalSafeT, side });

    // Ghim root thật vào tường theo finalSafeT
    const safePose = wallItemPose(wall, finalSafeT, curSide, resolveWallItemDims(model.modelId));
    model.root.position.x = safePose.x;
    model.root.position.z = safePose.z;
    setYawQuaternion(model.root, safePose.rotY);

    // Vertical: CHỈ kệ (mount) được kéo lên/xuống dọc chiều cao tường (cửa giữ cao độ theo sill,
    // gizmo đã khoá trục Y). Gizmo (attach = root) đã đổi root.position.y theo thao tác kéo; ở
    // đây CLAMP đáy model trong [sàn, đỉnh tường] rồi đồng bộ mountHeight + Transform.y để bền
    // vững sau khi thả (WallMountSystem không động tới Y → giá trị này được giữ nguyên).
    const wm = world.getComponent(entity, WallMounted);
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
    const topo = getWallItemTopology(world, entity);
    if (!topo) return;
    const wall = findMountWall(world, nodeReg, topo.hostWallId);
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

    setWallItemTopology(world, entity, { side: newSide });

    // Không snap quaternion ở đây — gizmo cần giữ tự do xoay để delta tích lũy.
    // WallMountSystem đang bị skip (GizmoHeld) nên sẽ không reset; snap về wall-derived
    // rotY được thực hiện tại dragEnd trong GizmoSystem.

    world.markDirty();
}

// ---------------------------------------------------------------------------
// Helpers nội bộ
// ---------------------------------------------------------------------------

/** Đường gióng wall-snap (sát sàn) để vẽ. */
type AlignGuide = { x1: number; z1: number; x2: number; z2: number };

/**
 * Floor clamp (proactive): trả về center-Y đã clamp sao cho ĐÁY vật
 * (`centerY - halfHeightFull`) không tụt xuống dưới mặt sàn `floorY`.
 *
 * Vì sao cần: sàn là entity `Grounded` bị CỐ Ý loại khỏi physics sweep
 * (xem CannonCollisionSystem.update) để đồ nằm sát sàn không bị tính "va chạm vĩnh
 * viễn". Hệ quả là va chạm KHÔNG chặn trục Y → đây là chốt chặn tường minh, rẻ (1
 * phép `max`) và chạy proactive (clamp TRƯỚC khi ghi Transform → không có frame nào
 * vật nằm dưới sàn, không giật).
 *
 * `halfHeightFull` = NỬA chiều cao thật của AABB (ColliderAABB.height vốn là
 * half-extent). Chỉ đúng khi vật chỉ xoay quanh Y (yaw) — đúng với nội thất hiện tại;
 * nếu sau này cho nghiêng X/Z thì đáy thật phải chiếu nửa-extent qua quaternion.
 */
export function clampCenterAboveFloor(centerY: number, halfHeightFull: number, floorY = 0): number {
    return Math.max(centerY, floorY + halfHeightFull);
}

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

    // ⭐ SEAM CHUNG furniture-translate (Phase 5.3): `resolveAlignment` (edge-snap +
    // wall-snap, OBB-aware) là NGUỒN SNAP có thẩm quyền dùng CHUNG với đường 2D
    // (useFurnitureDrag.applyFurnitureDrag). Trả {x,z} world (mét). Phần SAU seam KHÁC
    // backend có chủ đích → KHÔNG gộp (xem PHASE5 §5.3): ở đây dùng Cannon sweep
    // (wouldCollide/clampMovement, có trục Y) + clampCenterAboveFloor + dragGhost; 2D
    // dùng SAT miter-poly (không Y) + wouldFurnitureCollide + lastSafePos.
    const yaw = quatToYaw(q.x, q.y, q.z, q.w);
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

    // ix/iz = vị trí mong muốn (world, mét) sau snap. (2D gọi giá trị tương ứng `r.x/r.z`
    // rồi đổi sang px `intendedX/intendedY` — cùng seam, khác đơn vị.)
    const ix = aligned.x;
    const iz = aligned.z;

    // Floor clamp (hướng A): clamp theo CENTER để bất biến với pivot — đáy = center -
    // collider.height (half-extent). collider null (mesh-primitive hiếm) → halfFull 0.
    // Clamp xong đồng bộ ngược về object.position.y (đáy-mesh cho Model3D vì
    // halfH=collider.height; tâm cho mesh vì halfH=0) để gizmo + ghost không trôi xuống
    // dưới sàn ở các frame kế.
    const halfFull = collider ? collider.height : 0;
    const adjustedY = clampCenterAboveFloor(object.position.y + halfH, halfFull); // tâm-AABB cho va chạm/transform
    object.position.y = adjustedY - halfH;
    const iy = object.position.y;

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
