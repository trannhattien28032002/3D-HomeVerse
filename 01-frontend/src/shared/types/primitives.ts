/**
 * Primitive transport types — Vec2, Vec3, Bounds, Quat.
 *
 * Plain data, dùng được ở mọi layer (engine, app, shared utils). Không method,
 * không class — để serialize/deserialize trivial và tránh coupling.
 *
 * Layer: shared/types — pure types, không phụ thuộc bất kỳ runtime nào.
 */

export type Vec2 = { x: number; y: number };

export type Vec3 = { x: number; y: number; z: number };

/** Axis-aligned bounding box (mét). half-extents từ tâm. */
export type Bounds = { halfWidth: number; halfHeight: number; halfDepth: number };

/** Quaternion (xyzw). Dùng khi quaternion math cần cross-layer. */
export type Quat = { x: number; y: number; z: number; w: number };
