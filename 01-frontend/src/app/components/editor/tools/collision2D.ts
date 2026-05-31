/**
 * collision2D — domain-specific collision predicates cho 2D Plan View.
 *
 * Toàn bộ SAT primitives (obbCorners, wallSegmentPolygon, polygonsIntersect)
 * đã được move sang `src/shared/math/sat.ts` ở Đợt 2 — file này giữ lại các
 * predicate có dính tới UI store types (Furniture2D, Wall2D).
 *
 * Pixel-space — cùng hệ với Furniture2D / Wall2D trong useFloorPlanSnapshot.
 *
 * Dùng cho 2 luồng:
 *   - DrawWallTool: OBB tường-đang-vẽ vs furniture (chỉ furniture).
 *   - PlaceFurnitureTool: OBB ghost vs furniture + polygon tường.
 *
 * Khe hở `COLLISION_GAP_PX` (shared/constants/placement) đảm bảo chạm sát mép
 * không bị tính va chạm — để vẫn đặt được vật sát tường / vật khác.
 */

import type { Furniture2D, Wall2D } from "src/app/store/useFloorPlanSnapshot";
import { obbCorners, polygonsIntersect, type Poly } from "src/shared/math/sat";
import { COLLISION_GAP_PX } from "src/shared/constants/placement";

// Re-export primitives để consumer cũ (PlaceFurnitureTool, DrawWallTool) không
// phải đổi import path. New code nên import trực tiếp từ shared/math/sat.
export { obbCorners, wallSegmentPolygon } from "src/shared/math/sat";
export type { Pt, Poly } from "src/shared/math/sat";

/** Polygon (px) của một nội thất 2D — OBB từ tâm + footprint + góc xoay. */
export function furniturePolygon(f: Furniture2D): Poly {
    return obbCorners(f.x, f.y, f.width, f.depth, f.rotDeg);
}

/** true nếu `poly` chồng lấn BẤT KỲ nội thất nào (bỏ qua entity ignoreId). */
export function collidesWithFurniture(
    poly: Poly,
    furniture: Furniture2D[],
    ignoreId?: number,
): boolean {
    for (const f of furniture) {
        if (f.entityId === ignoreId) continue;
        if (polygonsIntersect(poly, furniturePolygon(f), COLLISION_GAP_PX)) return true;
    }
    return false;
}

/** true nếu `poly` chồng lấn BẤT KỲ tường nào (dùng miter-polygon của tường). */
export function collidesWithWalls(poly: Poly, walls: Wall2D[]): boolean {
    for (const w of walls) {
        if (!w.polygon || w.polygon.length < 3) continue;
        if (polygonsIntersect(poly, w.polygon, COLLISION_GAP_PX)) return true;
    }
    return false;
}
