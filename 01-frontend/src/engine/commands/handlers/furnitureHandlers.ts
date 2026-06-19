/**
 * furnitureHandlers — xử lý các command về furniture:
 *   PLACE_FURNITURE, DELETE_FURNITURE, MOVE_FURNITURE, ROTATE_FURNITURE.
 *
 * Extracted từ `dispatcher.ts` ở Đợt 3 (REFACTOR-PLAN.md).
 *
 * Note kiến trúc:
 *   - PLACE_FURNITURE / PLACE_WALL_ITEM trả về Promise<void>. Caller dùng
 *     `dispatchAsync` + `asyncTransaction` để snapshot được chụp TRƯỚC và
 *     đóng SAU khi entity tồn tại — đảm bảo undo xóa được entity. (R1 fix)
 *   - MOVE/ROTATE check collision qua `CannonCollisionSystem.wouldCollideCustom`.
 *     Nếu blocked: không update Transform/Object3D nhưng vẫn markDirty() để
 *     Konva sync lại snapshot (giữ vị trí cũ).
 */
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Model3D } from "src/engine/components/render/Model3D";
import { spawnFurnitureGLB, spawnWallItemGLB } from "src/engine/factories/FurnitureFactory";
import { applyMaterialToSlot, resetSlotToOriginal } from "src/engine/rendering/materialApply";
import { snapAngleRad } from "src/shared/constants/placement";
import { yawToQuat, quatToYaw } from "src/shared/math/yaw";
import { resolveAlignment } from "src/shared/geometry/alignment";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import { findMountWall } from "src/engine/adapters/wallRefs";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { collectOccupiedRanges } from "src/engine/utils/wallItemRanges";
import { getWallItemTopology, setWallItemTopology } from "src/engine/adapters/wallItemTopology";
import { wallItemOverlaps, occupancyLane } from "src/shared/geometry/wallMount";
import { countFurniture, MAX_FURNITURE_ENTITIES } from "src/engine/utils/furnitureLimit";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

type PlaceFurnitureCmd = Extract<EngineCommand, { type: "PLACE_FURNITURE" }>;
type PlaceWallItemCmd = Extract<EngineCommand, { type: "PLACE_WALL_ITEM" }>;
type MoveWallItemCmd = Extract<EngineCommand, { type: "MOVE_WALL_ITEM" }>;
type DeleteFurnitureCmd = Extract<EngineCommand, { type: "DELETE_FURNITURE" }>;
type MoveFurnitureCmd = Extract<EngineCommand, { type: "MOVE_FURNITURE" }>;
type RotateFurnitureCmd = Extract<EngineCommand, { type: "ROTATE_FURNITURE" }>;
type ApplyMaterialCmd = Extract<EngineCommand, { type: "APPLY_FURNITURE_MATERIAL" }>;
type ResetMaterialCmd = Extract<EngineCommand, { type: "RESET_FURNITURE_MATERIAL" }>;

// =================================================================
// PLACE_FURNITURE — Async GLB spawn
// =================================================================
// Trả về Promise<void> thay vì void để dispatcher có thể await trước khi
// đóng transaction. Gọi từ dispatchAsync() → asyncTransaction() đảm bảo
// undo snapshot được chụp SAU khi entity đã thực sự tồn tại trong World.
export function handlePlaceFurniture(command: PlaceFurnitureCmd, deps: DispatcherDeps): Promise<void> {
    const { world, scene, events, gltfLoader, modelRegistry, materialLibrary } = deps;
    // Chốt cứng chống spam — chặn mọi đường dispatch (UI placement LẪN AI agent). Đếm
    // TRƯỚC spawn; chạm trần → phát event cho UI toast, không spawn. (xem furnitureLimit.ts)
    const count = countFurniture(world);
    if (count >= MAX_FURNITURE_ENTITIES) {
        events.emit("entityLimitReached", { count, limit: MAX_FURNITURE_ENTITIES });
        return Promise.resolve();
    }
    return spawnFurnitureGLB(world, scene, command.modelId, command.x, command.z, command.rotY, gltfLoader, modelRegistry, command.materials, materialLibrary, command.y)
        .then(() => undefined)
        .catch(err => console.error("PLACE_FURNITURE failed:", err));
}

// =================================================================
// PLACE_WALL_ITEM — Async GLB spawn cho item bám tường (kệ/cửa/cửa sổ)
// =================================================================
// Trả về Promise<void> để dispatcher có thể await trước khi đóng transaction.
// Xem ghi chú PLACE_FURNITURE ở trên.
export function handlePlaceWallItem(command: PlaceWallItemCmd, deps: DispatcherDeps): Promise<void> {
    const { world, scene, events, gltfLoader, modelRegistry, nodeRegistry, materialLibrary } = deps;
    // Wall-item cũng mang FurnitureTag → tính chung trần với đồ sàn. Chốt cứng như PLACE_FURNITURE.
    const count = countFurniture(world);
    if (count >= MAX_FURNITURE_ENTITIES) {
        events.emit("entityLimitReached", { count, limit: MAX_FURNITURE_ENTITIES });
        return Promise.resolve();
    }
    return spawnWallItemGLB(
        world, scene, command.modelId,
        command.hostWallId, command.t, command.side,
        gltfLoader, modelRegistry, nodeRegistry,
        command.materials, materialLibrary,
    ).then(() => undefined).catch(err => console.error("PLACE_WALL_ITEM failed:", err));
}

// =================================================================
// MOVE_WALL_ITEM — Di chuyển / lật item bám tường đã đặt (cửa/cửa sổ/kệ)
// =================================================================
// Cập nhật tham số topology (hostWallId, t, side) — WallMountSystem suy lại
// Transform + WallOpeningSystem khoét lại tường ở frame kế. KHÔNG ghi Transform
// trực tiếp (sẽ bị WallMountSystem override). Từ chối nếu chồng opening khác.
export function handleMoveWallItem(command: MoveWallItemCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry } = deps;

    const topo = getWallItemTopology(world, command.entityId);
    const model = world.getComponent(command.entityId, Model3D);
    if (!topo || !model) { world.markDirty(); return; }

    const wall = findMountWall(world, nodeRegistry, command.hostWallId);
    if (!wall) { world.markDirty(); return; }

    const wallLen = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) || 1e-6;
    const halfWidth = getFootprint2D(model.modelId).width / 2;
    const minT = halfWidth / wallLen;
    const maxT = 1 - minT;
    const t = minT < maxT ? Math.max(minT, Math.min(command.t, maxT)) : 0.5;
    const halfWidthT = halfWidth / wallLen;

    // Chồng opening/kệ khác trên cùng tường → từ chối (giữ nguyên, markDirty để 2D snap lại).
    // Lane: cửa (opening) chiếm cả hai mặt; kệ chỉ chiếm mặt theo command.side.
    const lane = occupancyLane(topo.kind, command.side);
    const occupied = collectOccupiedRanges(world, command.hostWallId, wallLen, command.entityId);
    if (wallItemOverlaps(t, halfWidthT, lane, occupied)) { world.markDirty(); return; }

    setWallItemTopology(world, command.entityId, { hostWallId: command.hostWallId, t, side: command.side });
    world.markDirty();
}

// =================================================================
// DELETE_FURNITURE — Xóa furniture entity
// =================================================================
// entityRegistry.disposeEntity: nhận FurnitureTag → modelRegistry.dispose(id)
// + meshRegistry.dispose("furniture-${id}") (legacy box) + world.destroyEntity.
export function handleDeleteFurniture(command: DeleteFurnitureCmd, deps: DispatcherDeps): void {
    const { world, entityRegistry } = deps;
    const entity = command.entityId;
    if (!world.hasComponent(entity, FurnitureTag)) return;
    entityRegistry.disposeEntity(entity);
}

// =================================================================
// MOVE_FURNITURE — Di chuyển trong 2D, blocked by collision
// =================================================================
// Nếu bị chặn: giữ vị trí cũ nhưng vẫn markDirty() để Konva sync lại snapshot.
export function handleMoveFurniture(command: MoveFurnitureCmd, deps: DispatcherDeps): void {
    const { world, collisionSystem, modelRegistry, nodeRegistry } = deps;

    const t = world.getComponent(command.entityId, Transform);
    const c = world.getComponent(command.entityId, ColliderAABB);
    if (!t || !c) { world.markDirty(); return; }

    // force=true (group-move/rotate): đặt THẲNG vị trí, KHÔNG snap/collision. Cả cụm dời
    // theo delta cứng → giữ layout tương đối; va chạm nới lỏng (cho chồng tạm) — quyết định v1.
    if (command.force) {
        t.x = command.x;
        t.z = command.z;
        const obj = modelRegistry.get(command.entityId);
        if (obj) {
            obj.position.x = command.x;
            obj.position.z = command.z;
        }
        world.markDirty();
        return;
    }

    // Nguồn snap CÓ THẨM QUYỀN: edge-snap lưới + wall-snap (OBB-aware). Dùng chung
    // helper với preview ở 2D/3D nên committed value khớp preview, và wall-snap không
    // bị hàng-rào grid center-based làm lệch (RC-5 + RC-6). c.width/c.depth = half-extent.
    const yaw = quatToYaw(t.qx, t.qy, t.qz, t.qw);
    const aligned = resolveAlignment({
        cx: command.x,
        cz: command.z,
        hw: c.width,
        hd: c.depth,
        rotY: yaw,
        walls: collectWallSegments(world, nodeRegistry),
        neighbors: collectFurnitureBoxes(world, command.entityId),
    });
    const x = aligned.x;
    const z = aligned.z;

    const colW = c.width * 2;
    const colH = c.height * 2;
    const colD = c.depth * 2;

    // wouldCollideCustom signature là (width, depth, height) — Z trước Y.
    // Truyền (colW, colD, colH) giữ shape probe đúng; nếu (colW, colH, colD)
    // sẽ làm probe cao bằng depth → đâm qua floor collider → luôn "blocked".
    const blocked = collisionSystem.wouldCollideCustom(
        x, t.y, z,
        colW, colD, colH,
        t.qx, t.qy, t.qz, t.qw,
        command.entityId,
    );

    if (!blocked) {
        t.x = x;
        t.z = z;
        const obj = modelRegistry.get(command.entityId);
        if (obj) {
            obj.position.x = x;
            obj.position.z = z;
        }
    }
    world.markDirty();
}

// =================================================================
// ROTATE_FURNITURE — Xoay 2D, blocked by collision
// =================================================================
export function handleRotateFurniture(command: RotateFurnitureCmd, deps: DispatcherDeps): void {
    const { world, collisionSystem, modelRegistry } = deps;

    const t = world.getComponent(command.entityId, Transform);
    const c = world.getComponent(command.entityId, ColliderAABB);
    if (!t || !c) { world.markDirty(); return; }

    // Hàng rào snap cuối — góc về bội số ROT_STEP_DEG (RC-5).
    const rotY = snapAngleRad(command.rotY);
    const { x: newQx, y: newQy, z: newQz, w: newQw } = yawToQuat(rotY);

    const colW = c.width * 2;
    const colH = c.height * 2;
    const colD = c.depth * 2;

    // force=true (group-rotate): đặt thẳng góc, KHÔNG collision (va chạm nới lỏng — quyết định v1).
    // (width, depth, height) — xem ghi chú ở MOVE_FURNITURE.
    const blocked = command.force ? false : collisionSystem.wouldCollideCustom(
        t.x, t.y, t.z,
        colW, colD, colH,
        newQx, newQy, newQz, newQw,
        command.entityId,
    );

    if (!blocked) {
        t.rotY = rotY;
        modelRegistry.get(command.entityId)?.quaternion.set(newQx, newQy, newQz, newQw);
    }
    world.markDirty();
}

// =================================================================
// APPLY_FURNITURE_MATERIAL — Đổi material một slot (component) của model
// =================================================================
// Async (nạp texture PBR). Gán lại mesh.material trên Model3D.root → đổi tức thì
// ở khung 3D (RenderSystem vẽ mỗi frame). Ghi materialOverrides để serialize.
// No-op nếu entity không có Model3D (vd legacy box furniture).
export function handleApplyFurnitureMaterial(command: ApplyMaterialCmd, deps: DispatcherDeps): void {
    const { world, materialLibrary } = deps;
    const model = world.getComponent(command.entityId, Model3D);
    if (!model) return;
    applyMaterialToSlot(model, command.slotId, command.materialId, materialLibrary)
        .catch((err) => console.error("APPLY_FURNITURE_MATERIAL failed:", err));
}

// =================================================================
// RESET_FURNITURE_MATERIAL — Khôi phục material gốc (GLB) cho 1 slot
// =================================================================
// Đồng bộ (không nạp texture) — gán lại mesh.material từ originalMaterials đã chụp.
// No-op nếu entity không có Model3D.
export function handleResetFurnitureMaterial(command: ResetMaterialCmd, deps: DispatcherDeps): void {
    const { world } = deps;
    const model = world.getComponent(command.entityId, Model3D);
    if (!model) return;
    resetSlotToOriginal(model, command.slotId);
}
