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

/** Grid snap increment mặc định cho furniture placement / move (mét). */
export const SNAP_M = 0.01;

/** Các bước lưới snap người dùng có thể luân phiên (mét) — nút Grid ở TopNavBar. */
export const SNAP_OPTIONS: readonly number[] = [0.01, 0.05, 0.1, 0.25, 0.5];

/**
 * Bước lưới snap ĐANG hoạt động (runtime). Mọi snap 2D + 3D đọc qua
 * {@link snapToGridM} nên đổi giá trị này là áp dụng ngay cả 2 view.
 * Khởi tạo = {@link SNAP_M}. Đổi qua {@link setSnapM}.
 */
let activeSnapM: number = SNAP_M;

/** Đọc bước lưới snap hiện hành (mét). */
export function getSnapM(): number {
    return activeSnapM;
}

/** Đặt bước lưới snap hiện hành (mét). Áp dụng ngay cho mọi snap vị trí 2D + 3D. */
export function setSnapM(v: number): void {
    activeSnapM = v;
}

/** Rotation snap step cho rotate handle (độ). 24 stops mỗi 15° = vòng tròn đầy đủ. */
export const ROT_STEP_DEG = 15;

/**
 * Dung sai (mét) để "hút" mép nội thất áp sát mặt trong của tường khi move/place.
 * Khi khoảng cách từ mép vật tới mặt tường nhỏ hơn ngưỡng này → snap sát tường.
 * 0.15m ≈ trùng với AutoAlign tolerance để cảm giác snap nhất quán.
 */
export const WALL_SNAP_TOL_M = 0.15;

/**
 * Khe hở (mét) chừa lại giữa mép vật và mặt tường khi wall-snap, để không
 * lập tức bị collision chặn (lớn hơn {@link COLLISION_SHRINK_M}). ≈ 5mm.
 */
export const WALL_SNAP_GAP_M = 0.005;

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
 * Snap một giá trị scalar world (mét) về lưới {@link activeSnapM} hiện hành.
 * Dùng cho cả 2D drag và 3D placement để đảm bảo 2 view đồng bộ.
 */
export function snapToGridM(v: number): number {
    return Math.round(v / activeSnapM) * activeSnapM;
}

/** Bước snap góc (radian) — dẫn xuất từ {@link ROT_STEP_DEG}. */
export const ROT_STEP_RAD = (ROT_STEP_DEG * Math.PI) / 180;

/**
 * Snap góc (radian) về bội số của {@link ROT_STEP_DEG}.
 * Dùng cho rotate ở cả 2D (sau khi convert từ Konva độ) và 3D (gizmo).
 */
export function snapAngleRad(rad: number): number {
    return Math.round(rad / ROT_STEP_RAD) * ROT_STEP_RAD;
}

/** Snap góc (độ) về bội số của {@link ROT_STEP_DEG}. */
export function snapAngleDeg(deg: number): number {
    return Math.round(deg / ROT_STEP_DEG) * ROT_STEP_DEG;
}
