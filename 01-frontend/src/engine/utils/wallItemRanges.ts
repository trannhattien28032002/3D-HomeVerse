/**
 * wallItemRanges — gom occupied t-ranges của wall items từ ECS World.
 *
 * Phiên bản ECS-coupled của logic occupancy (đọc World + Query), khác với
 * `wallOccupancy.ts` (thuần data, không ECS). Đặt ở tầng util trung lập để cả
 * `gizmoHandles` (3D, import three/addons) lẫn `furnitureHandlers` (command tier,
 * KHÔNG được kéo three/addons vào) cùng dùng mà không phụ thuộc lẫn nhau.
 */
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { Model3D } from "src/engine/components/render/Model3D";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { occupancyLane, type WallItemRange } from "src/shared/geometry/wallMount";

/**
 * Gom t-range của mọi wall item trên cùng tường (trừ entity đang kéo).
 * wallLen (mét) dùng để chuyển width → halfWidthT.
 */
export function collectOccupiedRanges(
    world: World,
    hostWallId: string,
    wallLen: number,
    excludeEntity: string,
): WallItemRange[] {
    const ranges: WallItemRange[] = [];
    for (const e of Query.entitiesWith(world, WallOpening)) {
        if (e === excludeEntity) continue;
        const wo = world.getComponent(e, WallOpening)!;
        if (wo.hostWallId !== hostWallId) continue;
        const halfT = (wo.width / 2) / wallLen;
        ranges.push({ tMin: wo.t - halfT, tMax: wo.t + halfT, lane: occupancyLane("opening", wo.side) });
    }
    for (const e of Query.entitiesWith(world, WallMounted)) {
        if (e === excludeEntity) continue;
        const wm = world.getComponent(e, WallMounted)!;
        if (wm.hostWallId !== hostWallId) continue;
        const model = world.getComponent(e, Model3D);
        if (!model) continue;
        const halfT = (getFootprint2D(model.modelId).width / 2) / wallLen;
        ranges.push({ tMin: wm.t - halfT, tMax: wm.t + halfT, lane: occupancyLane("mount", wm.side) });
    }
    return ranges;
}
