/**
 * collision2D — domain-specific collision predicates cho 2D Plan View.
 *
 * Toàn bộ SAT primitives (obbCorners, wallSegmentPolygon, polygonsIntersect)
 * đã được move sang `src/shared/math/geometry.ts` ở Đợt 2 — file này giữ lại các
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

import type { Furniture2D, Wall2D } from "src/app/plan2d/types";
import { obbCorners, polygonsIntersect, type Poly } from "src/shared/math/geometry";
import { COLLISION_GAP_PX } from "src/shared/constants/placement";

// Re-export primitives để consumer cũ (PlaceFurnitureTool, DrawWallTool) không
// phải đổi import path. New code nên import trực tiếp từ shared/math/geometry.
export { obbCorners, wallSegmentPolygon } from "src/shared/math/geometry";
export type { Pt, Poly } from "src/shared/math/geometry";

/** Polygon (px) của một nội thất 2D — OBB từ tâm + footprint + góc xoay. */
export function furniturePolygon(f: Furniture2D): Poly {
    return obbCorners(f.x, f.y, f.width, f.depth, f.rotDeg);
}

/** AABB trục-thẳng (px) — broad-phase rẻ để loại nhanh cặp ở xa trước khi SAT. */
type AABB = { minX: number; minY: number; maxX: number; maxY: number };

/** AABB của một polygon (px). */
function polyAABB(poly: Poly): AABB {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}

/** AABB của OBB nội thất từ tâm+footprint+góc — KHÔNG dựng poly (rẻ hơn furniturePolygon). */
function furnitureAABB(f: Furniture2D): AABB {
    const rad = (f.rotDeg * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    const hx = (f.width / 2) * c + (f.depth / 2) * s;
    const hy = (f.width / 2) * s + (f.depth / 2) * c;
    return { minX: f.x - hx, minY: f.y - hy, maxX: f.x + hx, maxY: f.y + hy };
}

/**
 * 2 AABB RỜI hẳn nhau ⇒ OBB bên trong cũng rời (AABB ⊇ OBB) ⇒ chắc chắn không va
 * chạm ⇒ bỏ qua SAT an toàn (không bao giờ false-negative). Dùng gap=0 để bảo toàn.
 */
function aabbDisjoint(a: AABB, b: AABB): boolean {
    return a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
}

/** true nếu `poly` chồng lấn BẤT KỲ nội thất nào (bỏ qua entity ignoreId). */
export function collidesWithFurniture(
    poly: Poly,
    furniture: Furniture2D[],
    ignoreId?: string,
): boolean {
    const box = polyAABB(poly);
    for (const f of furniture) {
        if (f.entityId === ignoreId) continue;
        // Broad-phase: AABB rời nhau → bỏ qua, tránh dựng furniturePolygon + SAT.
        if (aabbDisjoint(box, furnitureAABB(f))) continue;
        if (polygonsIntersect(poly, furniturePolygon(f), COLLISION_GAP_PX)) return true;
    }
    return false;
}

/** true nếu `poly` chồng lấn BẤT KỲ tường nào (dùng miter-polygon của tường). */
export function collidesWithWalls(poly: Poly, walls: Wall2D[]): boolean {
    const box = polyAABB(poly);
    for (const w of walls) {
        if (!w.polygon || w.polygon.length < 3) continue;
        if (aabbDisjoint(box, polyAABB(w.polygon))) continue; // broad-phase reject
        if (polygonsIntersect(poly, w.polygon, COLLISION_GAP_PX)) return true;
    }
    return false;
}
