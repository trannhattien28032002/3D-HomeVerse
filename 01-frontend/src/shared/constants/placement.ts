/**
 * Placement & manipulation constants — SINGLE SOURCE OF TRUTH.
 *
 * Tất cả logic snap nội thất (2D + 3D), rotation step, ghost preview phải
 * import từ đây. Đừng tạo constants `SNAP_*` cục bộ trong file consumer
 * (đây là pain #1 của REFACTOR-PLAN.md — duplicate 3 chỗ).
 *
 * Layer: shared/constants — pure data, không phụ thuộc engine/React/Konva.
 *
 * Replaces (Đợt 1):
 *   - FurniturePlacementSystem.ts:12  `SNAP_GRID = 0.25`
 *   - PlaceFurnitureTool.tsx:13       `SNAP_WORLD = 0.25`
 *   - PlanView2D.tsx:62-63            `SNAP_WORLD = 0.25` + `ROT_SNAP_DEG = 15`
 */

/** Grid snap increment cho furniture placement / move (mét). */
export const SNAP_M = 0.25;

/** Rotation snap step cho rotate handle (độ). 24 stops mỗi 15° = vòng tròn đầy đủ. */
export const ROT_STEP_DEG = 15;

/** Ghost preview opacity khi đang đặt furniture (0..1). */
export const GHOST_OPACITY = 0.5;

/**
 * Khe hở "chạm mép cho phép" trong PIXEL-SPACE — dùng cho SAT 2D ở collision2D.
 * ≈ 5mm ở 100px/m (PX_PER_WORLD = 100).
 */
export const COLLISION_GAP_PX = 0.5;

/**
 * Shrink (m) áp dụng vào half-extents khi probe Cannon — tương đương "gap" ở 3D.
 * Hiện = 2mm. Note Đợt 2: drift đã ghi nhận với {@link COLLISION_GAP_PX} (5mm/2D
 * vs 2mm/3D). Chưa unify — để dành cho future refactor có test suite chứng minh
 * 2 view ra cùng quyết định cho cùng input.
 */
export const COLLISION_SHRINK_M = 0.002;

/**
 * Snap một giá trị scalar world (mét) về lưới {@link SNAP_M}.
 * Dùng cho cả 2D drag và 3D placement để đảm bảo 2 view đồng bộ.
 */
export function snapToGridM(v: number): number {
    return Math.round(v / SNAP_M) * SNAP_M;
}
