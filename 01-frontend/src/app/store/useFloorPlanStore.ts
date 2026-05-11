import { useState, useEffect, useMemo } from "react";
import type { ECSSnapshot, NodeSnapshot, WallSnapshot, NodeCapSnapshot, RoomSnapshot } from "src/engine/events/EngineEvents";

const PX_PER_WORLD = 20;

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
    area: number;
    polygon: { x: number; y: number }[];
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

function roomToPx(r: RoomSnapshot, ox: number, oy: number): Room2D {
    return {
        id: r.id,
        area: r.area,
        polygon: r.polygon.map(p => ({ x: p.x * PX_PER_WORLD + ox, y: p.z * PX_PER_WORLD + oy })),
    };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFloorPlanStore(vpW: number, vpH: number): {
    nodes: Node2D[];
    walls: Wall2D[];
    caps: Cap2D[];
    rooms: Room2D[];
} {
    const [snap, setSnap] = useState<ECSSnapshot | null>(() => {
        return window.gameEngine?.api.events.lastSnapshot ?? null;
    });

    useEffect(() => {
        const engine = window.gameEngine;
        if (!engine) return;
        if (engine.api.events.lastSnapshot) setSnap(engine.api.events.lastSnapshot);
        return engine.api.events.on("snapshot", setSnap);
    }, []);

    return useMemo(() => {
        if (!snap) return { nodes: [], walls: [], caps: [], rooms: [] };
        const ox = vpW / 2, oy = vpH / 2;
        return {
            nodes: snap.nodes.map(n => nodeToPx(n, ox, oy)),
            walls: snap.walls.map(w => wallToPx(w, ox, oy)),
            caps: snap.caps.map(c => capToPx(c, ox, oy)),
            rooms: snap.rooms.map(r => roomToPx(r, ox, oy)),
        };
    }, [snap, vpW, vpH]);
}

export type { Node2D as NodeData2D, Wall2D as WallData2D, Cap2D as CapData2D, Room2D as RoomData2D };
