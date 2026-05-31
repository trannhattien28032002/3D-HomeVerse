/**
 * useFloorPlanStore — hook chuyển đổi ECSSnapshot sang pixel-space cho Konva.
 *
 * Đây là lớp adapter giữa engine (world-space metres) và PlanView2D (pixel canvas).
 * Không phải Zustand store — là custom hook React với useState + useEffect.
 *
 * Flow dữ liệu:
 *   ECS → SnapshotSystem → EngineEvents "snapshot" → setSnap → useMemo → PlanView2D
 *
 * Coordinate system:
 *   World: (x, z) metres, origin ở tâm scene
 *   Canvas: (x, y) pixels, origin ở góc trên trái Konva Stage
 *   Conversion: canvasX = worldX * PX_PER_WORLD + viewportWidth/2
 *               canvasY = worldZ * PX_PER_WORLD + viewportHeight/2
 *   (Konva Y = world Z — không flip trục)
 *
 * Performance:
 *   - useMemo: chỉ recompute khi snap, vpW, hoặc vpH thay đổi
 *   - ECSSnapshot chỉ emit khi hash scene thay đổi (SnapshotSystem kiểm tra)
 *
 * Input:  vpW, vpH — kích thước viewport để tính offset origin
 * Output: nodes/walls/caps/rooms/dimensions/angleDimensions trong px
 */
import { useState, useEffect, useMemo } from "react";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import type { ECSSnapshot, NodeSnapshot, WallSnapshot, NodeCapSnapshot, RoomSnapshot, DimensionSnapshot, AngleDimensionSnapshot } from "src/engine/events/EngineEvents";

/** 1 world unit (1 metre) = 100 pixels trên canvas Konva */
const PX_PER_WORLD = 100;

// ─── 2D pixel-space types for Konva ───────────────────────────────────────────

/** Node trong pixel-space — id stable từ ECS, (x,y) là toạ độ canvas px. */
export type Node2D = {
    id: number;
    x: number; // px (canvas)
    y: number; // px (Konva Y = world Z * 100 + offsetY)
};

/** Wall trong pixel-space — polygon là 4 điểm miter-cut đã tính từ WallGeometrySystem. */
export type Wall2D = {
    id: number;
    startNodeId: number;
    endNodeId: number;
    thickness: number; // world units (metres) — giữ nguyên để PlanView dùng cho snap
    height: number;    // world units (metres)
    cx: number; // center px — dùng cho label
    cy: number; // center px
    /** 4-point miter polygon (px) — undefined khi wall chưa có WallPolygon component */
    polygon?: { x: number; y: number }[];
};

/** Cap polygon tại junction ≥ 3 tường — điền gap giữa các miter corners. */
export type Cap2D = {
    nodeId: number;
    polygon: { x: number; y: number }[]; // N-gon px
};

/** Phòng được phát hiện — polygon px + centroid px cho area label. */
export type Room2D = {
    id: string;
    area: number;          // m²
    polygon: { x: number; y: number }[];
    centroidX: number;     // px — area-weighted centroid (Shoelace)
    centroidY: number;
    label: string;         // e.g. "12.5 m²" hoặc "12 m²"
};

/** Dimension annotation cho một wall — toạ độ đã offset vuông góc với tường. */
export type Dimension2D = {
    wallId: number;
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
    nodeId: number;
    cx: number;            // corner px
    cy: number;
    angle: number;         // interior angle degrees [5, 175]
    startAngleDeg: number; // Konva Arc rotation (from +X, CW)
    sweepAngleDeg: number;
    bisectorX: number;     // unit bisector screen-space (dùng đặt label)
    bisectorY: number;
    label: string;         // e.g. "90°"
};

// ─── Conversion helpers ────────────────────────────────────────────────────────
// Tất cả hàm này là pure — chuyển đổi world-space → pixel-space
// ox, oy = offset origin (= viewportWidth/2, viewportHeight/2)

function nodeToPx(n: NodeSnapshot, ox: number, oy: number): Node2D {
    return { id: n.id, x: n.x * PX_PER_WORLD + ox, y: n.z * PX_PER_WORLD + oy };
}

function wallToPx(w: WallSnapshot, ox: number, oy: number): Wall2D {
    return {
        id: w.wallId,
        startNodeId: w.startNodeId,
        endNodeId: w.endNodeId,
        thickness: w.thickness,
        height: w.height,
        cx: w.cx * PX_PER_WORLD + ox,
        cy: w.cz * PX_PER_WORLD + oy,
        polygon: w.polygon?.map(p => ({ x: p.x * PX_PER_WORLD + ox, y: p.z * PX_PER_WORLD + oy })),
    };
}

function capToPx(c: NodeCapSnapshot, ox: number, oy: number): Cap2D {
    return {
        nodeId: c.nodeId,
        polygon: c.polygon.map(p => ({ x: p.x * PX_PER_WORLD + ox, y: p.z * PX_PER_WORLD + oy })),
    };
}

/**
 * Tính centroid có trọng số diện tích của polygon (công thức Shoelace).
 * Đúng cho cả convex và non-convex. Fallback về trung bình vertex khi area = 0.
 * Dùng để đặt label diện tích phòng ở vị trí chính giữa (không phải trung bình vertex).
 */
function computePolygonCentroid(pts: { x: number; y: number }[]): { x: number; y: number } {
    let area = 0, cx = 0, cy = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const cross = a.x * b.y - b.x * a.y;
        area += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }
    area /= 2;
    if (Math.abs(area) < 1e-6) {
        return {
            x: pts.reduce((s, p) => s + p.x, 0) / n,
            y: pts.reduce((s, p) => s + p.y, 0) / n,
        };
    }
    return { x: cx / (6 * area), y: cy / (6 * area) };
}

function roomToPx(r: RoomSnapshot, ox: number, oy: number): Room2D {
    const polygon = r.polygon.map(p => ({ x: p.x * PX_PER_WORLD + ox, y: p.z * PX_PER_WORLD + oy }));
    const { x: centroidX, y: centroidY } = computePolygonCentroid(polygon);
    const a = r.area;
    const label = a >= 10 ? `${Math.round(a)} m²` : `${a.toFixed(1)} m²`;
    return { id: r.id, area: a, polygon, centroidX, centroidY, label };
}

function dimToPx(d: DimensionSnapshot, ox: number, oy: number): Dimension2D {
    const mm = Math.round(d.length * 1000);
    return {
        wallId: d.wallId,
        length: d.length,
        startX: d.startX * PX_PER_WORLD + ox,
        startY: d.startZ * PX_PER_WORLD + oy,
        endX:   d.endX * PX_PER_WORLD + ox,
        endY:   d.endZ * PX_PER_WORLD + oy,
        perpX:  d.perpX,
        perpY:  d.perpZ, // world Z maps to canvas Y
        label:  mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm} mm`,
    };
}

// World Z → canvas Y with same sign (no flip), so startAngle and bisector pass through unchanged.
function angleToPx(a: AngleDimensionSnapshot, ox: number, oy: number): AngleDimension2D {
    return {
        nodeId: a.nodeId,
        cx: a.cornerX * PX_PER_WORLD + ox,
        cy: a.cornerZ * PX_PER_WORLD + oy,
        angle: a.angle,
        startAngleDeg: a.startAngle,
        sweepAngleDeg: a.sweepAngle,
        bisectorX: a.bisectorX,
        bisectorY: a.bisectorZ,
        label: `${Math.round(a.angle)}°`,
    };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe vào ECSSnapshot và convert sang pixel-space Konva data.
 *
 * @param vpW Chiều rộng viewport (px) — dùng tính offset origin
 * @param vpH Chiều cao viewport (px) — dùng tính offset origin
 *
 * State flow:
 *   engine "snapshot" event → setSnap → useMemo recompute → re-render PlanView2D
 *
 * Lý do dùng useState + useEffect thay vì useSyncExternalStore:
 *   EngineEvents là custom EventBus không theo React store contract.
 *   useEffect + cleanup unsubscribe đảm bảo không leak listener khi component unmount.
 */
export function useFloorPlanStore(vpW: number, vpH: number): {
    nodes: Node2D[];
    walls: Wall2D[];
    caps: Cap2D[];
    rooms: Room2D[];
    dimensions: Dimension2D[];
    angleDimensions: AngleDimension2D[];
} {
    // Ưu tiên EngineContext, fallback về window.gameEngine (backward-compat)
    const engine = useEngineOrNull();

    const [snap, setSnap] = useState<ECSSnapshot | null>(() => {
        // useState initializer chạy synchronous — context chưa được populate
        // → đọc trực tiếp từ window.gameEngine (nếu có)
        return window.gameEngine?.api.events.lastSnapshot ?? null;
    });

    useEffect(() => {
        if (!engine) return;
        // Sync ngay nếu snapshot đã tồn tại (ví dụ: hot-reload trong dev)
        if (engine.api.events.lastSnapshot) setSnap(engine.api.events.lastSnapshot);
        // Trả về cleanup function để unsubscribe khi engine thay đổi hoặc unmount
        return engine.api.events.on("snapshot", setSnap);
    }, [engine]); // re-run khi engine lần đầu available qua context

    return useMemo(() => {
        if (!snap) return { nodes: [], walls: [], caps: [], rooms: [], dimensions: [], angleDimensions: [] };
        const ox = vpW / 2, oy = vpH / 2;
        return {
            nodes:           snap.nodes.map(n => nodeToPx(n, ox, oy)),
            walls:           snap.walls.map(w => wallToPx(w, ox, oy)),
            caps:            snap.caps.map(c => capToPx(c, ox, oy)),
            rooms:           snap.rooms.map(r => roomToPx(r, ox, oy)),
            dimensions:      snap.dimensions.map(d => dimToPx(d, ox, oy)),
            angleDimensions: (snap.angleDimensions ?? []).map(a => angleToPx(a, ox, oy)),
        };
    }, [snap, vpW, vpH]);
}

export type { Node2D as NodeData2D, Wall2D as WallData2D, Cap2D as CapData2D, Room2D as RoomData2D };
