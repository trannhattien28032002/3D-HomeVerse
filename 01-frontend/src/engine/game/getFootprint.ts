/**
 * Footprint resolution — single source of truth cho mọi nơi cần biết kích thước
 * va chạm của một nội thất (cả spawn-time và runtime).
 *
 * 2 use case khác nhau:
 *
 * 1. **Spawn-time** — chưa có entity, chỉ có `modelId` + `ModelTemplate` từ GLB loader.
 *    Dùng {@link resolveCollisionFootprint} → áp dụng priority chain 3 tier:
 *      Tier 1: `_col` mesh in GLB (loader-computed CollisionFootprint, accurate nhất)
 *      Tier 2: `collisionBox` in objects.json  (designer authored)
 *      Tier 3: visual AABB từ mesh hiển thị     (zero-config fallback)
 *
 *    Consumers (spawn ghost / spawn entity — phải khớp dim):
 *      - `FurnitureFactory.spawnFurnitureGLB` (line 120)
 *      - `FurniturePlacementSystem.onMouseMove` (line 232 — ghost preview)
 *
 * 2. **Runtime** — entity đã tồn tại, đã có sẵn `ColliderAABB` từ spawn-time.
 *    Dùng {@link getEntityFootprint2D} → đọc live ColliderAABB×2, fallback catalog.
 *
 *    Consumers:
 *      - `SnapshotSystem.update` (mỗi frame, build FurnitureSnapshot)
 *
 * File này thay thế (Đợt 2) `engine/game/collisionUtils.ts`. Logic
 * `resolveCollisionFootprint` không đổi — chỉ rename file + thêm helper runtime.
 */
import type { World } from "src/engine/ecs/World";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import type { ModelTemplate } from "src/engine/rendering/GLTFModelLoader";
import { getCollisionBox, getFootprint2D, type Footprint2D } from "src/engine/game/FurnitureCatalog";

export type ResolvedFootprint = {
    width: number;
    depth: number;
    height: number;
    /** Indicates which tier supplied the data — useful for dev logging. */
    source: "mesh" | "json" | "visual";
};

/**
 * Spawn-time footprint resolver. Returns full extents (NOT half-extents).
 * Callers must halve values when constructing ColliderAABB (which takes half-extents).
 *
 * See file header — tier 1 → 2 → 3 priority chain.
 */
export function resolveCollisionFootprint(
    modelId: string,
    template: ModelTemplate,
): ResolvedFootprint {
    // Tier 1: _col mesh authored by designer in Blender.
    const fp = template.collisionFootprint;
    if (fp) return { ...fp, source: "mesh" };

    // Tier 2: explicit collisionBox in objects.json.
    // height?: number was added to CollisionBox for Phase M; treat 0/absent as fallback.
    const colBox = getCollisionBox(modelId);
    if (colBox) {
        const height =
            colBox.height != null && colBox.height > 0
                ? colBox.height
                : template.size.y; // TODO Phase M: populate collisionBox.height in objects.json
        return { width: colBox.width, depth: colBox.depth, height, source: "json" };
    }

    // Tier 3: auto-AABB from the visible mesh (visual size, zero-config).
    return {
        width: template.size.x,
        depth: template.size.z,
        height: template.size.y,
        source: "visual",
    };
}

/**
 * Runtime 2D footprint cho một entity đang tồn tại trong ECS.
 *
 * Ưu tiên live {@link ColliderAABB} (đã set ở spawn-time bằng priority chain)
 * vì nó luôn match với hình va chạm Cannon đang dùng. Chỉ fallback catalog khi
 * entity không có ColliderAABB (defensive — không xảy ra với code hiện tại,
 * giữ làm safety net).
 *
 * Trả về FULL extents (width, depth in metres) — không phải half-extents.
 *
 * @param world ECS World
 * @param entityId Furniture entity id
 * @param modelId Catalog model id để fallback nếu cần
 */
export function getEntityFootprint2D(
    world: World,
    entityId: number,
    modelId: string,
): Footprint2D {
    const col = world.getComponent(entityId, ColliderAABB);
    if (col) return { width: col.width * 2, depth: col.depth * 2 };
    return getFootprint2D(modelId);
}
