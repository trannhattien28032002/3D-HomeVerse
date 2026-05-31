/**
 * wallHandlers — xử lý các command CRUD/topology trên tường:
 *   ADD_WALL, REMOVE_WALL, UPDATE_WALL, SPLIT_WALL, RESOLVE_INTERSECTIONS.
 *
 * Node-level commands (ENSURE_NODE, MOVE_NODE, MERGE_NODE) ở `nodeHandlers.ts`.
 *
 * Extracted từ `dispatcher.ts` ở Đợt 3 (REFACTOR-PLAN.md). Mỗi handler là pure
 * function nhận `(command, deps)` — testable mà không cần instantiate dispatcher.
 */
import { WallNodes } from "src/engine/components/WallNodes";
import { WallSize } from "src/engine/components/WallSize";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { createWall } from "src/engine/game/WallFactory";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import { splitWallAt } from "src/engine/commands/handlers/wallTopology";

type AddWallCmd = Extract<EngineCommand, { type: "ADD_WALL" }>;
type RemoveWallCmd = Extract<EngineCommand, { type: "REMOVE_WALL" }>;
type UpdateWallCmd = Extract<EngineCommand, { type: "UPDATE_WALL" }>;
type SplitWallCmd = Extract<EngineCommand, { type: "SPLIT_WALL" }>;
type ResolveIntersectionsCmd = Extract<EngineCommand, { type: "RESOLVE_INTERSECTIONS" }>;

// =================================================================
// ADD_WALL — Tạo tường mới giữa hai node đã tồn tại
// =================================================================
// Pipeline:
//   1. Validate: cả hai node phải tồn tại.
//   2. Kiểm tra duplicate: không tạo tường trùng (A→B đã có thì skip).
//   3. createWall → ECS entity với đầy đủ component.
//   4. Kết nối hai node + đăng ký wallEntityByWallId + cập nhật maxWallIdRef.
//   5. Invalidate WallPolygon của tường hàng xóm tại hai đầu node.
export function handleAddWall(command: AddWallCmd, deps: DispatcherDeps): void {
    const { world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry } = deps;

    const sn = nodeRegistry.get(command.startNodeId);
    const en = nodeRegistry.get(command.endNodeId);
    if (!sn || !en) {
        // WARNING: Nếu UI gọi ADD_WALL trước ENSURE_NODE, sẽ bị warn ở đây.
        console.warn(`ADD_WALL: node ${command.startNodeId} or ${command.endNodeId} not found`);
        return;
    }

    // Kiểm tra cặp node đã có tường nối chưa (undirected).
    // O(degree × 1) — OK với độ kết nối node bình thường.
    const pairAlreadyExists = [...sn.connectedWallIds].some(wid => {
        const ent = wallEntityByWallId.get(wid);
        if (ent == null) return false;
        const wn = world.getComponent(ent, WallNodes);
        if (!wn) return false;
        return (
            (wn.startNodeId === command.startNodeId && wn.endNodeId === command.endNodeId) ||
            (wn.startNodeId === command.endNodeId   && wn.endNodeId === command.startNodeId)
        );
    });
    if (pairAlreadyExists) {
        console.warn(`ADD_WALL: wall between node ${command.startNodeId} and ${command.endNodeId} already exists — skipped.`);
        return;
    }

    // Tọa độ trung tâm + length cho initial mesh. WallGeometrySystem tinh chỉnh
    // sau từ polygon — đây chỉ là estimate để đặt transform.
    const dx = en.x - sn.x, dz = en.z - sn.z;
    const length = Math.hypot(dx, dz);
    const cx = (sn.x + en.x) / 2;
    const cz = (sn.z + en.z) / 2;

    const entity = createWall(world, scene, {
        wallId: command.wallId,
        startNodeId: command.startNodeId,
        endNodeId: command.endNodeId,
        cx, cy: 1.6, cz,
        length,
        height: 3.2,
        thickness: command.thickness,
    }, meshRegistry, materialRegistry);

    nodeRegistry.connectWall(command.startNodeId, command.wallId);
    nodeRegistry.connectWall(command.endNodeId, command.wallId);
    wallEntityByWallId.set(command.wallId, entity);

    if (command.wallId > maxWallIdRef.value) maxWallIdRef.value = command.wallId;

    // Invalidate WallPolygon các tường hàng xóm — cách vẽ joint thay đổi.
    for (const nodeId of [command.startNodeId, command.endNodeId]) {
        const nd = nodeRegistry.get(nodeId);
        if (!nd) continue;
        for (const wid of nd.connectedWallIds) {
            if (wid === command.wallId) continue;
            const ent = wallEntityByWallId.get(wid);
            if (ent != null && world.hasComponent(ent, WallPolygon)) {
                world.removeComponent(ent, WallPolygon);
            }
        }
    }
}

// =================================================================
// REMOVE_WALL — Xóa tường và dọn dẹp tài nguyên
// =================================================================
// Thứ tự cleanup:
//   1. Ngắt kết nối topology trong nodeRegistry.
//   2. Dispose qua entityRegistry (mesh + destroyEntity).
//   3. Xóa wallEntityByWallId entry.
//   4. Xóa orphan node — node không còn tường nào kết nối.
//
// WARNING: Không invalidate WallPolygon của tường hàng xóm — TODO cũ.
export function handleRemoveWall(command: RemoveWallCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry, wallEntityByWallId, entityRegistry } = deps;

    const entity = wallEntityByWallId.get(command.wallId);
    if (entity == null) return; // no-op

    const wn = world.getComponent(entity, WallNodes);
    const affectedNodeIds: number[] = [];

    if (wn) {
        nodeRegistry.disconnectWall(wn.startNodeId, command.wallId);
        nodeRegistry.disconnectWall(wn.endNodeId, command.wallId);
        affectedNodeIds.push(wn.startNodeId, wn.endNodeId);
    }

    // entityRegistry.disposeEntity: nhận WallTag → meshRegistry.dispose("wall-${id}")
    // + world.destroyEntity. Thay 3 dòng manual ở dispatcher cũ.
    entityRegistry.disposeEntity(entity);
    wallEntityByWallId.delete(command.wallId);

    // Dọn dẹp orphan nodes.
    for (const nodeId of affectedNodeIds) {
        const nd = nodeRegistry.get(nodeId);
        if (nd && nd.connectedWallIds.size === 0) {
            nodeRegistry.deleteNode(nodeId);
        }
    }
}

// =================================================================
// UPDATE_WALL — Cập nhật thickness/height
// =================================================================
// Remove polygon để WallGeometrySystem rebuild mesh (cần cho height changes
// dù XZ polygon không đổi).
export function handleUpdateWall(command: UpdateWallCmd, deps: DispatcherDeps): void {
    const { world, wallEntityByWallId } = deps;

    const entity = wallEntityByWallId.get(command.wallId);
    if (entity == null) return;

    const wn = world.getComponent(entity, WallNodes);
    const size = world.getComponent(entity, WallSize);

    if (wn && command.thickness !== undefined) wn.thickness = command.thickness;
    if (size && command.height !== undefined) size.height = command.height;

    if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
}

// =================================================================
// SPLIT_WALL — Chia đôi một tường tại (x, z)
// =================================================================
// Thin wrapper. Tách dispatcher khỏi raw helper signature — helper
// splitWallAt cũng được dùng nội bộ bởi RESOLVE_INTERSECTIONS.
export function handleSplitWall(command: SplitWallCmd, deps: DispatcherDeps): void {
    splitWallAt(command.originalWallId, command.newWallId, command.newNodeId, command.x, command.z, deps);
}

// =================================================================
// RESOLVE_INTERSECTIONS — Tự động xử lý giao điểm của tường mới
// =================================================================
// Khi user vẽ xong một tường, lệnh này quét xem tường mới có cắt qua tường cũ
// nào không. Nếu có, cả hai tường đều được chia tại điểm giao.
//
// Thuật toán (xem dispatcher cũ để có giải thích chi tiết):
//   1. Tìm giao điểm 2 đoạn thẳng (XZ plane), bỏ qua endpoint (EPS = 1e-4).
//   2. Sort theo t (từ start → end của tường mới).
//   3. Với mỗi giao điểm: split tường cũ, split nửa sau tường mới.
//   4. currentWallId ← nửa sau sau mỗi lần split.
export function handleResolveIntersections(command: ResolveIntersectionsCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry, wallEntityByWallId, maxWallIdRef } = deps;

    const newEnt = wallEntityByWallId.get(command.wallId);
    if (newEnt == null) return;
    const newWn = world.getComponent(newEnt, WallNodes);
    if (!newWn) return;

    const sn = nodeRegistry.get(newWn.startNodeId);
    const en = nodeRegistry.get(newWn.endNodeId);
    if (!sn || !en) return;

    const EPS = 1e-4;

    type IXPoint = { t: number; existingWallId: number; x: number; z: number };
    const intersections: IXPoint[] = [];

    const ux = en.x - sn.x, uz = en.z - sn.z;

    for (const [wid, ent] of wallEntityByWallId) {
        if (wid === command.wallId) continue;

        const wn = world.getComponent(ent, WallNodes);
        if (!wn) continue;

        // Bỏ qua tường đã chia sẻ node — kết nối tại endpoint, không cắt nhau.
        const sharesNode =
            wn.startNodeId === newWn.startNodeId ||
            wn.endNodeId   === newWn.startNodeId ||
            wn.startNodeId === newWn.endNodeId   ||
            wn.endNodeId   === newWn.endNodeId;
        if (sharesNode) continue;

        const p1 = nodeRegistry.get(wn.startNodeId);
        const p2 = nodeRegistry.get(wn.endNodeId);
        if (!p1 || !p2) continue;

        const vx = p2.x - p1.x, vz = p2.z - p1.z;
        const wx = sn.x - p1.x, wz = sn.z - p1.z;

        const denom = ux * vz - uz * vx;
        if (Math.abs(denom) < 1e-8) continue; // parallel/collinear → skip

        const t = (vx * wz - vz * wx) / denom;
        const s = (ux * wz - uz * wx) / denom;

        if (t > EPS && t < 1 - EPS && s > EPS && s < 1 - EPS) {
            intersections.push({ t, existingWallId: wid, x: sn.x + t * ux, z: sn.z + t * uz });
        }
    }

    if (intersections.length === 0) return;

    intersections.sort((a, b) => a.t - b.t);

    // currentWallId track nửa sau của tường mới sau mỗi lần split.
    let currentWallId = command.wallId;

    for (const ix of intersections) {
        const newNodeId = nodeRegistry.createNode(ix.x, ix.z);
        world.markDirty();

        // Split tường cũ
        splitWallAt(ix.existingWallId, maxWallIdRef.value + 1, newNodeId, ix.x, ix.z, deps);
        // Split currentWallId (nửa sau của tường mới)
        splitWallAt(currentWallId, maxWallIdRef.value + 1, newNodeId, ix.x, ix.z, deps);

        currentWallId = maxWallIdRef.value;
    }
}
