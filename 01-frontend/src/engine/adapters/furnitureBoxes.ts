/**
 * furnitureBoxes — gom footprint các món nội thất về {@link FurnitureBox} (world)
 * cho neighbor-align. Engine-side adapter cho helper thuần shared/geometry.
 */
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import type { FurnitureBox } from "src/shared/geometry/alignment";

export function collectFurnitureBoxes(world: World, exclude?: string): FurnitureBox[] {
    const out: FurnitureBox[] = [];
    for (const e of Query.entitiesWith(world, FurnitureTag, Transform, ColliderAABB)) {
        if (e === exclude) continue;
        const t = world.getComponent(e, Transform)!;
        const c = world.getComponent(e, ColliderAABB)!;
        out.push({ cx: t.x, cz: t.z, hw: c.width, hd: c.depth, rotY: 2 * Math.atan2(t.qy, t.qw) });
    }
    return out;
}
