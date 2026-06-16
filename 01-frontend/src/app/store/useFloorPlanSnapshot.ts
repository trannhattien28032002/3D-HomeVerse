/**
 * useFloorPlanSnapshot — hook chuyển đổi ECSSnapshot sang pixel-space cho Konva.
 *
 * **Không phải Zustand store** — là custom React hook (useState + useEffect + useMemo).
 * Tên cũ `useFloorPlanStore` đã được rename ở Đợt 4 vì gây hiểu nhầm với Zustand
 * (xem REFACTOR-PLAN.md). Đây là **adapter** giữa engine snapshot (world-space
 * metres) và PlanView2D (pixel canvas).
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
import type { ECSSnapshot, NodeSnapshot, WallSnapshot, NodeCapSnapshot, RoomSnapshot, DimensionSnapshot, AngleDimensionSnapshot, FurnitureSnapshot } from "src/engine/events/EngineEvents";
import { PX_PER_WORLD, threeRotYToKonvaDeg } from "src/shared/math/coords";
import type { Vec2 } from "src/shared/types/primitives";

// PX_PER_WORLD imported from shared/math/coords — single source for world↔canvas scale.

// ─── Re-export 2D pixel-space types từ module trung lập (R4) ──────────────────
// Các type đã được tách ra src/app/plan2d/types.ts để 14 importer không
// phụ thuộc vào hook store. Re-export để giữ backward compat cho caller cũ.
export type { Node2D, Wall2D, Cap2D, Room2D, Dimension2D, AngleDimension2D, Furniture2D } from "src/app/plan2d/types";
import type { Node2D, Wall2D, Cap2D, Room2D, Dimension2D, AngleDimension2D, Furniture2D } from "src/app/plan2d/types";

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
function computePolygonCentroid(pts: Vec2[]): Vec2 {
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
    // 1e-6 px² is effectively zero at 100px/m scale (a 1m² room has ~1e4 px²).
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
    return { id: r.id, key: r.key, area: a, polygon, centroidX, centroidY, label };
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

function furnitureToPx(f: FurnitureSnapshot, ox: number, oy: number): Furniture2D {
    const base: Furniture2D = {
        entityId: f.entityId,
        modelId: f.modelId,
        x: f.x * PX_PER_WORLD + ox,
        y: f.z * PX_PER_WORLD + oy,
        width: f.width * PX_PER_WORLD,
        depth: f.depth * PX_PER_WORLD,
        rotDeg: threeRotYToKonvaDeg(f.rotY),
        topDownUrl: f.topDownUrl,
    };
    if (f.isWallItem) {
        base.isWallItem = true;
        base.wallBehavior = f.wallBehavior;
        base.hostWallId = f.hostWallId;
        base.wallT = f.wallT;
        base.wallSide = f.wallSide;
        base.sill = f.sill;
        base.overlapping = f.overlapping;
        if (f.cutWidth !== undefined) base.cutWidthPx = f.cutWidth * PX_PER_WORLD;
        if (f.cutHeight !== undefined) base.cutHeightPx = f.cutHeight * PX_PER_WORLD;
    }
    return base;
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
 *
 * Performance (R2):
 *   useMemo tách thành từng collection riêng biệt — khi chỉ furniture thay đổi
 *   (e.g. drag kết thúc), walls/rooms/dimensions không re-map lại, các layer
 *   dùng React.memo sẽ không re-render.
 */
export function useFloorPlanSnapshot(vpW: number, vpH: number): {
    nodes: Node2D[];
    walls: Wall2D[];
    caps: Cap2D[];
    rooms: Room2D[];
    dimensions: Dimension2D[];
    angleDimensions: AngleDimension2D[];
    furniture: Furniture2D[];
} {
    const engine = useEngineOrNull();

    const [snap, setSnap] = useState<ECSSnapshot | null>(null);

    useEffect(() => {
        if (!engine) return;
        // Sync ngay nếu snapshot đã tồn tại (ví dụ: hot-reload trong dev)
        if (engine.api.events.lastSnapshot) setSnap(engine.api.events.lastSnapshot);
        // Trả về cleanup function để unsubscribe khi engine thay đổi hoặc unmount
        return engine.api.events.on("snapshot", setSnap);
    }, [engine]); // re-run khi engine lần đầu available qua context

    // ── Per-collection snapshot memos ─────────────────────────────────────────
    // Mỗi collection dùng useMemo riêng để chỉ collection thay đổi mới trigger re-map.
    // Khi drag furniture: chỉ snap.furniture đổi → chỉ furniture memo invalidate;
    // WallLayer/RoomLayer/DimensionLayer (dùng React.memo) không re-render.

    const ox = vpW / 2;
    const oy = vpH / 2;

    const nodes = useMemo(
        () => snap ? snap.nodes.map(n => nodeToPx(n, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.nodes, ox, oy],
    );

    const walls = useMemo(
        () => snap ? snap.walls.map(w => wallToPx(w, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.walls, ox, oy],
    );

    const caps = useMemo(
        () => snap ? snap.caps.map(c => capToPx(c, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.caps, ox, oy],
    );

    const rooms = useMemo(
        () => snap ? snap.rooms.map(r => roomToPx(r, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.rooms, ox, oy],
    );

    const dimensions = useMemo(
        () => snap ? snap.dimensions.map(d => dimToPx(d, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.dimensions, ox, oy],
    );

    const angleDimensions = useMemo(
        () => snap ? (snap.angleDimensions ?? []).map(a => angleToPx(a, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.angleDimensions, ox, oy],
    );

    const furniture = useMemo(
        () => snap ? (snap.furniture ?? []).map(f => furnitureToPx(f, ox, oy)) : [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snap?.furniture, ox, oy],
    );

    return { nodes, walls, caps, rooms, dimensions, angleDimensions, furniture };
}

export type { Node2D as NodeData2D, Wall2D as WallData2D, Cap2D as CapData2D, Room2D as RoomData2D };
