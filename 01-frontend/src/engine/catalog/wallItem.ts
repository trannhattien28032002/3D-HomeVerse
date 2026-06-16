/**
 * wallItem — adapter engine-side: dựng {@link WallItemDims} thuần từ catalog.
 *
 * Gom hai nguồn của catalog về một chỗ để mọi đường (spawn, ghost, bám-tường,
 * kéo gizmo) cùng dùng chung kích thước → tránh lệch nhau:
 *   - getPlacement : behavior / faceGap / mountHeight / cut.sill
 *   - getFootprint2D: bề sâu vuông góc tường (NGUỒN DUY NHẤT cho `depth`)
 *
 * `depth` cố ý lấy từ footprint (collisionBox/boundingBox trong objects.json) — KHÔNG
 * dùng bề sâu hiển thị `template.size.z` — để khớp đúng giá trị WallMountSystem suy lại
 * mỗi frame, nhờ vậy vật KHÔNG nhảy vị trí ở frame đầu sau khi spawn.
 *
 * `displayHeight` (chiều cao hiển thị, = template.size.y) chỉ cần cho việc đặt Y lúc
 * spawn/ghost; các đường chỉ chỉnh X/Z (WallMountSystem, slideWallItem) truyền 0 vì
 * bỏ qua baseY/centerY.
 */
import { getPlacement, getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import type { WallItemDims } from "src/shared/geometry/wallMount";

export function resolveWallItemDims(modelId: string, displayHeight: number = 0): WallItemDims {
    const place = getPlacement(modelId);
    const fp = getFootprint2D(modelId);
    return {
        behavior: place.behavior === "opening" ? "opening" : "mount",
        depth: fp.depth,
        height: displayHeight,
        faceGap: place.faceGap,
        sill: place.cut?.sill ?? 0,
        mountHeight: place.mountHeight,
    };
}
