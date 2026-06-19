/**
 * Plan 2D pixel-space types — module trung lập cho toàn bộ tầng 2D.
 *
 * Trước R4: các type này sống trong `useFloorPlanSnapshot` — hook store đã trở thành
 * hub coupling rộng, 14 file import type từ đây dù không cần hook.
 *
 * Sau R4: type chuyển sang đây, hook chỉ giữ subscription + conversion logic.
 * Mọi layer, tool, và collision helper import từ `src/app/features/plan2d/types` — không
 * phụ thuộc vào `useFloorPlanSnapshot` để lấy type thuần.
 *
 * Coordinate system:
 *   World: (x, z) metres, origin ở tâm scene
 *   Canvas: (x, y) pixels, origin ở góc trên trái Konva Stage
 *   Conversion: canvasX = worldX * PX_PER_WORLD + viewportWidth/2
 *               canvasY = worldZ * PX_PER_WORLD + viewportHeight/2
 *   (Konva Y = world Z — không flip trục)
 */
import type { Vec2 } from "src/shared/types/primitives";

/** Node trong pixel-space — id stable từ ECS, (x,y) là toạ độ canvas px. */
export type Node2D = {
    id: string;
    x: number; // px (canvas)
    y: number; // px (Konva Y = world Z * 100 + offsetY)
};

/** Wall trong pixel-space — polygon là 4 điểm miter-cut đã tính từ WallGeometrySystem. */
export type Wall2D = {
    id: string;
    startNodeId: string;
    endNodeId: string;
    thickness: number; // world units (metres) — giữ nguyên để PlanView dùng cho snap
    height: number;    // world units (metres)
    cx: number; // center px — dùng cho label
    cy: number; // center px
    /** 4-point miter polygon (px) — undefined khi wall chưa có WallPolygon component */
    polygon?: Vec2[];
};

/** Cap polygon tại junction ≥ 3 tường — điền gap giữa các miter corners. */
export type Cap2D = {
    nodeId: string;
    polygon: Vec2[]; // N-gon px
};

/** Phòng được phát hiện — polygon px + centroid px cho area label. */
export type Room2D = {
    id: string;
    /** Khóa phòng bền (sorted nodeIds) — dùng để gắn material sàn (SET_FLOOR_MATERIAL). */
    key: string;
    area: number;          // m²
    polygon: Vec2[];
    centroidX: number;     // px — area-weighted centroid (Shoelace)
    centroidY: number;
    label: string;         // e.g. "12.5 m²" hoặc "12 m²"
};

/** Dimension annotation cho một wall — toạ độ đã offset vuông góc với tường. */
export type Dimension2D = {
    wallId: string;
    length: number; // metres (giữ nguyên để tính hiển thị)
    startX: number; // px
    startY: number; // px
    endX: number;   // px
    endY: number;   // px
    perpX: number;  // unit perpendicular — không scale (dùng để offset annotation)
    perpY: number;
    label: string;  // e.g. "3500 mm" hoặc "3.50 m"
};

/** Angle annotation tại corner — Arc Konva + label. */
export type AngleDimension2D = {
    nodeId: string;
    cx: number;            // corner px
    cy: number;
    angle: number;         // interior angle degrees [5, 175]
    startAngleDeg: number; // Konva Arc rotation (from +X, CW)
    sweepAngleDeg: number;
    bisectorX: number;     // unit bisector screen-space (dùng đặt label)
    bisectorY: number;
    label: string;         // e.g. "90°"
};

/** Furniture trong pixel-space — footprint top-down để vẽ lên Konva. */
export type Furniture2D = {
    entityId: string;
    modelId: string;
    x: number;       // tâm px (canvasX = worldX * 100 + ox)
    y: number;       // tâm px (Konva Y = worldZ * 100 + oy)
    width: number;   // px = footprint mét * PX_PER_WORLD
    depth: number;   // px
    rotDeg: number;  // độ — Konva rotation (clockwise), từ Transform.rotY
    /** Top-down image URL. Undefined = render gray box + label fallback. */
    topDownUrl: string | undefined;
    // Wall-item metadata (undefined cho floor furniture)
    isWallItem?: boolean;
    wallBehavior?: "opening" | "mount";
    hostWallId?: string;
    /** Vị trí dọc tim tường, 0..1. */
    wallT?: number;
    /** Mặt tường: +1 / −1. */
    wallSide?: number;
    /** Bề rộng lỗ khoét đã convert sang px. */
    cutWidthPx?: number;
    /** Chiều cao lỗ khoét đã convert sang px. */
    cutHeightPx?: number;
    /** Cao độ mép dưới lỗ (mét) — giữ đơn vị mét vì chỉ dùng cho logic, không vẽ. */
    sill?: number;
    /** Wall-item chồng chỗ với item khác trên cùng tường → vẽ cảnh báo đỏ. */
    overlapping?: boolean;
};
