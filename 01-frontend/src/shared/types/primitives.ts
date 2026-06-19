/**
 * Primitive transport types — Vec2, Vec3, Bounds, Quat.
 *
 * Plain data, dùng được ở mọi layer (engine, app, shared utils). Không method,
 * không class — để serialize/deserialize trivial và tránh coupling.
 *
 * Layer: shared/types — pure types, không phụ thuộc bất kỳ runtime nào.
 */

export type Vec2 = { x: number; y: number };

/**
 * Điểm trên mặt phẳng SÀN (trục X ngang, Z sâu) — KHÁC {@link Vec2} (x,y màn hình).
 * Tách tên riêng để không lẫn hai hệ trục: code 2D/UI dùng Vec2 (x,y), code
 * cảnh/engine dùng Vec2XZ khi nói về toạ độ thế giới trên sàn.
 */
export type Vec2XZ = { x: number; z: number };

/** Hộp bao trục, trên mặt phẳng sàn XZ (mét). */
export type BBoxXZ = { minX: number; minZ: number; maxX: number; maxZ: number };

export type Vec3 = { x: number; y: number; z: number };

/** Axis-aligned bounding box (mét). half-extents từ tâm. */
export type Bounds = { halfWidth: number; halfHeight: number; halfDepth: number };

/** Quaternion (xyzw). Dùng khi quaternion math cần cross-layer. */
export type Quat = { x: number; y: number; z: number; w: number };
