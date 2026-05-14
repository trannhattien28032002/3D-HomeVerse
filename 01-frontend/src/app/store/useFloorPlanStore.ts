import { useState, useEffect, useMemo } from "react";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import type { ECSSnapshot, NodeSnapshot, WallSnapshot, NodeCapSnapshot, RoomSnapshot, DimensionSnapshot, AngleDimensionSnapshot } from "src/engine/events/EngineEvents";

const PX_PER_WORLD = 100;

// ─── 2D pixel-space types for Konva ───────────────────────────────────────────

export type Node2D = {
    id: number;
    x: number; // px
    y: number; // px (Konva Y = world Z)
};

export type Wall2D = {
    id: number;
    startNodeId: number;
    endNodeId: number;
    thickness: number; // world units
    height: number;   // world units
    cx: number; // center px
    cy: number; // center px
    /** 4-point miter polygon in px, if available */
    polygon?: { x: number; y: number }[];
};

export type Cap2D = {
    nodeId: number;
    /** N-gon polygon in px that fills the junction gap */
    polygon: { x: number; y: number }[];
};

export type Room2D = {
    id: string;
    area: number;        // m²
    polygon: { x: number; y: number }[];
    centroidX: number;   // px — area-weighted centroid for label placement
    centroidY: number;
    label: string;       // formatted, e.g. "12.5 m²"
};

export type Dimension2D = {
    wallId: number;
    length: number; // world units (meters)
    startX: number; // px
    startY: number;
    endX: number;
    endY: number;
    perpX: number;  // unit perpendicular (no px scaling)
    perpY: number;
    label: string;  // formatted length, e.g. "3500 mm"
};

export type AngleDimension2D = {
    nodeId: number;
    cx: number;           // corner in px
    cy: number;
    angle: number;        // interior angle in degrees
    startAngleDeg: number; // Konva Arc rotation (degrees from +X, CW)
    sweepAngleDeg: number;
    bisectorX: number;    // unit bisector, screen space
    bisectorY: number;
    label: string;        // e.g. "90°"
};

// ─── Conversion helpers ────────────────────────────────────────────────────────

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
 * Area-weighted centroid of a polygon (Shoelace-based).
 * Correct for both convex and non-convex polygons; handles CW and CCW winding.
 * Falls back to vertex average for degenerate (zero-area) cases.
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

export function useFloorPlanStore(vpW: number, vpH: number): {
    nodes: Node2D[];
    walls: Wall2D[];
    caps: Cap2D[];
    rooms: Room2D[];
    dimensions: Dimension2D[];
    angleDimensions: AngleDimension2D[];
} {
    // Engine from context (preferred) with window.gameEngine as fallback.
    // Re-subscribing to snapshot events when this changes (null → instance) is
    // handled by the [engine] dependency on the useEffect below.
    const engine = useEngineOrNull();

    const [snap, setSnap] = useState<ECSSnapshot | null>(() => {
        // useState initializer runs once synchronously. At this point the context
        // may not yet be populated, so we fall back to window.gameEngine directly.
        return window.gameEngine?.api.events.lastSnapshot ?? null;
    });

    useEffect(() => {
        if (!engine) return;
        // Sync immediately in case a snapshot already exists (e.g. hot-reload).
        if (engine.api.events.lastSnapshot) setSnap(engine.api.events.lastSnapshot);
        return engine.api.events.on("snapshot", setSnap);
    }, [engine]); // re-run when engine becomes available via context

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
