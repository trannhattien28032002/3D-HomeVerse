/**
 * wallTopology — internal wall geometry/topology helpers shared by handlers.
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
import { WallNodes } from "src/engine/components/WallNodes";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import { createWall } from "src/engine/game/WallFactory";
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
 *   - maxWallIdRef.value được bump lên newWallId
 */
export function splitWallAt(
    originalWallId: number,
    newWallId: number,
    newNodeId: number,
    x: number,
    z: number,
    deps: DispatcherDeps,
): void {
    const { world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry } = deps;

    const entity = wallEntityByWallId.get(originalWallId);
    if (entity == null) return;
    const wn = world.getComponent(entity, WallNodes);
    if (!wn) return;

    const { endNodeId, thickness } = wn;

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
        cx, cy: 1.6, cz,
        length,
        height: 3.2,
        thickness,
    }, meshRegistry, materialRegistry);

    nodeRegistry.connectWall(newNodeId, newWallId);
    nodeRegistry.connectWall(endNodeId, newWallId);
    wallEntityByWallId.set(newWallId, newEntity);

    if (newWallId > maxWallIdRef.value) maxWallIdRef.value = newWallId;

    for (const wallId of endNode.connectedWallIds) {
        const ent = wallEntityByWallId.get(wallId);
        if (ent != null && world.hasComponent(ent, WallPolygon)) {
            world.removeComponent(ent, WallPolygon);
        }
    }
}
