/**
 * wallRefs — adapter engine-side: tra cứu tường theo wallId bền vững và trả về
 * {@link MountWall} (đoạn tim + bề dày, world-space) cho helper thuần wallMount.
 *
 * Đọc WallTag.wallId (ID logic) + WallNodes (2 node + bề dày) rồi tra toạ độ thật ở
 * NodeRegistry (SOURCE OF TRUTH vị trí). wallId ĐỘC LẬP với entity id của ECS.
 */
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { MountWall } from "src/shared/geometry/wallMount";

/** Trả về entity (ECS id) của bức tường mang wallId cho trước, hoặc null. */
export function findWallEntity(world: World, wallId: string): string | null {
    for (const e of Query.entitiesWith(world, WallTag, WallNodes)) {
        const tag = world.getComponent(e, WallTag);
        if (tag && tag.wallId === wallId) return e;
    }
    return null;
}

/** Dựng MountWall (đoạn tim + bề dày) cho wallId, hoặc null nếu thiếu node/tường. */
export function findMountWall(
    world: World,
    nodeRegistry: NodeRegistry,
    wallId: string,
): MountWall | null {
    const e = findWallEntity(world, wallId);
    if (e == null) return null;
    const wn = world.getComponent(e, WallNodes);
    if (!wn) return null;
    const a = nodeRegistry.get(wn.startNodeId);
    const b = nodeRegistry.get(wn.endNodeId);
    if (!a || !b) return null;
    return { wallId, ax: a.x, az: a.z, bx: b.x, bz: b.z, thickness: wn.thickness };
}
