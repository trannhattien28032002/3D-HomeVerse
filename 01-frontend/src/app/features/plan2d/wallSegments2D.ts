/**
 * buildWallSegments2D — đổi tường pixel-space (Konva snapshot) sang WallSegment
 * world-space (mét) cho wall-snap. Dùng chung bởi PlanView2D (drag) và
 * PlaceFurnitureTool (placement) để 2 đường nhập snap nhất quán.
 */
import { konvaDegToThreeRotY } from "src/shared/math/coords";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Wall2D, Node2D, Furniture2D } from "src/app/features/plan2d/types";
import type { WallSegment, FurnitureBox } from "src/shared/geometry/alignment";

export function buildWallSegments2D(
    walls: Wall2D[],
    nodeById: Map<string, Node2D>,
    transform: PlanTransform,
): WallSegment[] {
    const segs: WallSegment[] = [];
    for (const w of walls) {
        const a = nodeById.get(w.startNodeId);
        const b = nodeById.get(w.endNodeId);
        if (!a || !b) continue;
        segs.push({
            ax: transform.toWorldX(a.x),
            az: transform.toWorldZ(a.y),
            bx: transform.toWorldX(b.x),
            bz: transform.toWorldZ(b.y),
            thickness: w.thickness,
        });
    }
    return segs;
}

/** Đổi nội thất pixel-space sang FurnitureBox world (mét) cho neighbor-align. */
export function buildFurnitureBoxes2D(
    furniture: Furniture2D[],
    transform: PlanTransform,
    excludeEntityId?: string,
): FurnitureBox[] {
    const out: FurnitureBox[] = [];
    for (const f of furniture) {
        if (f.entityId === excludeEntityId) continue;
        out.push({
            cx: transform.toWorldX(f.x),
            cz: transform.toWorldZ(f.y),
            hw: f.width / (2 * transform.scale),
            hd: f.depth / (2 * transform.scale),
            rotY: konvaDegToThreeRotY(f.rotDeg),
        });
    }
    return out;
}
