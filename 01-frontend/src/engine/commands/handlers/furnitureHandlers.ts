/**
 * furnitureHandlers — xử lý các command về furniture:
 *   PLACE_FURNITURE, DELETE_FURNITURE, MOVE_FURNITURE, ROTATE_FURNITURE.
 *
 * Extracted từ `dispatcher.ts` ở Đợt 3 (REFACTOR-PLAN.md).
 *
 * Note kiến trúc:
 *   - PLACE_FURNITURE async/fire-and-forget — undo ngay sau khi placement
 *     có thể không xoá entity vì snapshot transaction chụp trước khi entity
 *     được tạo. Đã được L2 ghi nhận, deferred fix.
 *   - MOVE/ROTATE check collision qua `CannonCollisionSystem.wouldCollideCustom`.
 *     Nếu blocked: không update Transform/Object3D nhưng vẫn markDirty() để
 *     Konva sync lại snapshot (giữ vị trí cũ).
 */
import { Transform } from "src/engine/components/Transform";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { FurnitureTag } from "src/engine/components/FurnitureTag";
import { spawnFurnitureGLB } from "src/engine/game/FurnitureFactory";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

type PlaceFurnitureCmd = Extract<EngineCommand, { type: "PLACE_FURNITURE" }>;
type DeleteFurnitureCmd = Extract<EngineCommand, { type: "DELETE_FURNITURE" }>;
type MoveFurnitureCmd = Extract<EngineCommand, { type: "MOVE_FURNITURE" }>;
type RotateFurnitureCmd = Extract<EngineCommand, { type: "ROTATE_FURNITURE" }>;

// =================================================================
// PLACE_FURNITURE — Async GLB spawn
// =================================================================
// NOTE (L2): fire-and-forget. Entity được tạo SAU khi promise resolve, nên
// undo ngay sau placement có thể không xoá entity (transaction snapshot
// được chụp TRƯỚC khi entity tồn tại). Deferred fix.
export function handlePlaceFurniture(command: PlaceFurnitureCmd, deps: DispatcherDeps): void {
    const { world, scene, gltfLoader, modelRegistry } = deps;
    spawnFurnitureGLB(world, scene, command.modelId, command.x, command.z, command.rotY, gltfLoader, modelRegistry)
        .catch(err => console.error("PLACE_FURNITURE failed:", err));
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
    const { world, collisionSystem, modelRegistry } = deps;

    const t = world.getComponent(command.entityId, Transform);
    const c = world.getComponent(command.entityId, ColliderAABB);
    if (!t || !c) { world.markDirty(); return; }

    const colW = c.width * 2;
    const colH = c.height * 2;
    const colD = c.depth * 2;

    // wouldCollideCustom signature là (width, depth, height) — Z trước Y.
    // Truyền (colW, colD, colH) giữ shape probe đúng; nếu (colW, colH, colD)
    // sẽ làm probe cao bằng depth → đâm qua floor collider → luôn "blocked".
    const blocked = collisionSystem.wouldCollideCustom(
        command.x, t.y, command.z,
        colW, colD, colH,
        t.qx, t.qy, t.qz, t.qw,
        command.entityId,
    );

    if (!blocked) {
        t.x = command.x;
        t.z = command.z;
        const obj = modelRegistry.get(command.entityId);
        if (obj) {
            obj.position.x = command.x;
            obj.position.z = command.z;
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

    const half = command.rotY / 2;
    const newQx = 0;
    const newQy = Math.sin(half);
    const newQz = 0;
    const newQw = Math.cos(half);

    const colW = c.width * 2;
    const colH = c.height * 2;
    const colD = c.depth * 2;

    // (width, depth, height) — see MOVE_FURNITURE note.
    const blocked = collisionSystem.wouldCollideCustom(
        t.x, t.y, t.z,
        colW, colD, colH,
        newQx, newQy, newQz, newQw,
        command.entityId,
    );

    if (!blocked) {
        t.rotY = command.rotY;
        modelRegistry.get(command.entityId)?.quaternion.set(newQx, newQy, newQz, newQw);
    }
    world.markDirty();
}
