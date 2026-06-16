/**
 * wallTopology — các helper hình học/topology tường dùng chung cho handler.
 *
 * Không phải command handler (không nhận EngineCommand). Là pure helper được
 * gọi bởi:
 *   - `handleSplitWall` trong `wallHandlers.ts` (case SPLIT_WALL)
 *   - `handleResolveIntersections` trong `wallHandlers.ts` (gọi nhiều lần
 *     với (newWallId, newNodeId) được generate trong vòng lặp giao cắt)
 *
 * Moved từ `engine/commands/wallTopology.ts` vào `handlers/` ở Đợt 3.
 * Signature đổi: tham số đầy đủ → 5 raw args + `DispatcherDeps`.
 */
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Query } from "src/engine/ecs/Query";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import { createWall } from "src/engine/factories/WallFactory";
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_CENTER_Y } from "src/shared/constants/wall";
import { remapWallItemOnSplit } from "src/shared/geometry/wallMount";
import type { World } from "src/engine/ecs/World";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

/**
 * Cắt một bức tường tại vị trí (x, z), tạo node mới và tường mới (nửa sau).
 *
 * Pure helper — không phải command handler. Caller sinh ra `newWallId` và
 * `newNodeId` trước khi gọi (xem RESOLVE_INTERSECTIONS).
 *
 * Sau khi gọi:
 *   - Tường cũ (originalWallId): [startNode → newNode]  (nửa đầu)
 *   - Tường mới (newWallId):       [newNode  → endNode] (nửa sau)
 *   - newNode được tạo + connect 2 wallId
 *   - WallPolygon của các tường hàng xóm được invalidate để rebuild mesh
 *   - Wall-items (cửa/cửa sổ/kệ) bám tường gốc được di trú sang đúng nửa: item ở
 *     nửa sau đổi hostWallId sang newWallId; `t` của cả hai nửa được remap theo
 *     chiều dài mới (xem remapWallItemOnSplit) → item KHÔNG trượt khi tường bị cắt.
 */
export function splitWallAt(
    originalWallId: string,
    newWallId: string,
    newNodeId: string,
    x: number,
    z: number,
    deps: DispatcherDeps,
): void {
    const { world, scene, nodeRegistry, wallEntityByWallId, meshRegistry, materialRegistry } = deps;

    const entity = wallEntityByWallId.get(originalWallId);
    if (entity == null) return;
    const wn = world.getComponent(entity, WallNodes);
    if (!wn) return;

    const { endNodeId, thickness } = wn;

    // Tỉ lệ cắt dọc tim tường GỐC (0..1) — tính TRƯỚC khi đổi endNodeId, dùng để
    // remap `t` của wall-items về đúng nửa. startNode không đổi; endNodeId là đầu gốc.
    let tSplit = 0.5;
    {
        const startNode = nodeRegistry.get(wn.startNodeId);
        const origEndNode = nodeRegistry.get(endNodeId);
        if (startNode && origEndNode) {
            const fullLen = Math.hypot(origEndNode.x - startNode.x, origEndNode.z - startNode.z);
            if (fullLen > 1e-6) tSplit = Math.hypot(x - startNode.x, z - startNode.z) / fullLen;
        }
    }

    nodeRegistry.ensureNode(newNodeId, x, z);
    nodeRegistry.move(newNodeId, x, z);
    world.markDirty();

    const newNode = nodeRegistry.get(newNodeId);
    if (newNode) {
        for (const wallId of newNode.connectedWallIds) {
            const ent = wallEntityByWallId.get(wallId);
            if (ent != null) {
                if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);
                recomputeWallAABB(world, ent, nodeRegistry);
            }
        }
    }

    wn.endNodeId = newNodeId;

    nodeRegistry.disconnectWall(endNodeId, originalWallId);
    nodeRegistry.connectWall(newNodeId, originalWallId);

    if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
    recomputeWallAABB(world, entity, nodeRegistry);

    const endNode = nodeRegistry.get(endNodeId)!;
    const cx = (x + endNode.x) / 2;
    const cz = (z + endNode.z) / 2;
    const length = Math.hypot(endNode.x - x, endNode.z - z);

    const newEntity = createWall(world, scene, {
        wallId: newWallId,
        startNodeId: newNodeId,
        endNodeId,
        cx, cy: DEFAULT_WALL_CENTER_Y, cz,
        length,
        height: DEFAULT_WALL_HEIGHT,
        thickness,
    }, meshRegistry, materialRegistry);

    nodeRegistry.connectWall(newNodeId, newWallId);
    nodeRegistry.connectWall(endNodeId, newWallId);
    wallEntityByWallId.set(newWallId, newEntity);

    for (const wallId of endNode.connectedWallIds) {
        const ent = wallEntityByWallId.get(wallId);
        if (ent != null && world.hasComponent(ent, WallPolygon)) {
            world.removeComponent(ent, WallPolygon);
        }
    }

    migrateWallItems(world, originalWallId, newWallId, tSplit);
}

/**
 * Di trú wall-items (WallOpening + WallMounted) bám tường gốc sang đúng nửa sau split.
 *   - item nửa đầu : giữ hostWallId gốc, chỉ remap `t` theo chiều dài mới.
 *   - item nửa sau : đổi hostWallId → newWallId, remap `t` về [0,1] của nửa sau.
 * `side` không đổi (hai nửa cùng hướng start→end ⇒ pháp tuyến giữ nguyên).
 *
 * WallMountSystem suy lại pose + WallOpeningSystem khoét lại CSG ở frame kế từ
 * (hostWallId, t) mới — không cần ghi Transform/mesh trực tiếp ở đây.
 */
function migrateWallItems(
    world: World,
    originalWallId: string,
    newWallId: string,
    tSplit: number,
): void {
    let changed = false;

    for (const e of Query.entitiesWith(world, WallOpening)) {
        const wo = world.getComponent(e, WallOpening)!;
        if (wo.hostWallId !== originalWallId) continue;
        const r = remapWallItemOnSplit(wo.t, tSplit);
        wo.t = r.t;
        if (r.half === "second") wo.hostWallId = newWallId;
        changed = true;
    }

    for (const e of Query.entitiesWith(world, WallMounted)) {
        const wm = world.getComponent(e, WallMounted)!;
        if (wm.hostWallId !== originalWallId) continue;
        const r = remapWallItemOnSplit(wm.t, tSplit);
        wm.t = r.t;
        if (r.half === "second") wm.hostWallId = newWallId;
        changed = true;
    }

    if (changed) world.markDirty();
}
