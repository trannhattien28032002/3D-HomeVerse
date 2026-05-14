import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { WallNodes } from "src/engine/components/WallNodes";
import { Transform } from "src/engine/components/Transform";
import { WallSize } from "src/engine/components/WallSize";
import { ColliderAABB } from "src/engine/components/ColliderAABB";

export function recomputeWallAABB(world: World, entity: number, nodes: NodeRegistry): void {
    const wn = world.getComponent(entity, WallNodes);
    if (!wn) return;

    const sn = nodes.get(wn.startNodeId);
    const en = nodes.get(wn.endNodeId);
    if (!sn || !en) return;

    const dx = en.x - sn.x, dz = en.z - sn.z;
    const len = Math.hypot(dx, dz);
    const rotY = -Math.atan2(dz, dx);
    const cx = (sn.x + en.x) / 2;
    const cz = (sn.z + en.z) / 2;

    const t = world.getComponent(entity, Transform);
    const s = world.getComponent(entity, WallSize);
    const c = world.getComponent(entity, ColliderAABB);

    if (t) { t.x = cx; t.z = cz; t.rotY = rotY; }
    if (s) { s.length = len; }
    if (c) { c.width = len / 2; }
}
