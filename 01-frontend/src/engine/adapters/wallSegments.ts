/**
 * wallSegments — gom tường về dạng {@link WallSegment} (world-space) cho wall-snap.
 *
 * Đọc topology từ WallNodes (id 2 node + bề dày) rồi tra toạ độ thật ở NodeRegistry
 * (SOURCE OF TRUTH vị trí). Engine-side adapter cho helper thuần shared/geometry.
 */
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { WallSegment } from "src/shared/geometry/alignment";

export function collectWallSegments(world: World, nodeRegistry: NodeRegistry): WallSegment[] {
    const out: WallSegment[] = [];
    for (const e of Query.entitiesWith(world, WallNodes)) {
        const wn = world.getComponent(e, WallNodes);
        if (!wn) continue;
        const a = nodeRegistry.get(wn.startNodeId);
        const b = nodeRegistry.get(wn.endNodeId);
        if (!a || !b) continue;
        out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, thickness: wn.thickness });
    }
    return out;
}
