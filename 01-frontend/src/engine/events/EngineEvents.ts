/**
 * EngineEvents — EventBus nội bộ của engine + tất cả snapshot types.
 *
 * Event flow:
 *   ECS Systems (SnapshotSystem) → events.emit("snapshot", data)
 *   → useFloorPlanStore.on("snapshot") → setSnap → PlanView2D re-render
 *
 * ECSSnapshot: trạng thái đầy đủ của scene được emit mỗi frame (khi có thay đổi).
 *   Bao gồm: nodes, walls, caps, rooms, dimensions, angleDimensions
 *   UI chỉ subscribe vào "snapshot" — không đọc ECS World trực tiếp.
 *
 * lastSnapshot: cache snapshot cuối để component mới mount có thể đọc ngay
 *   mà không phải chờ frame tiếp theo emit.
 */

// ============================================================
// Snapshot types — dữ liệu ECS "chụp" ra cho UI mỗi frame
// ============================================================

/** Snapshot của một node trong topology graph */
export type NodeSnapshot = {
    id: number;
    x: number; // world-space
    z: number;
};

/**
 * Snapshot của một tường.
 * UI dùng `polygon` để vẽ miter-cut shape.
 * `startNodeId` / `endNodeId` để biết node nào là endpoint.
 */
export type WallSnapshot = {
    wallId: number;
    startNodeId: number;
    endNodeId: number;
    thickness: number;
    height: number;
    /** Center of AABB bounding box (world-space) — dùng cho label */
    cx: number;
    cz: number;
    /** 4 miter-cut corners in world-space */
    polygon?: { x: number; z: number }[];
};

/** Dimension annotation for a single wall segment */
export type DimensionSnapshot = {
    wallId: number;
    length: number;  // world units (meters)
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    /** Unit vector perpendicular to wall (left of start→end) */
    perpX: number;
    perpZ: number;
};

/** Fill polygon for a node junction with 3+ walls */
export type NodeCapSnapshot = {
    nodeId: number;
    polygon: { x: number; z: number }[];
};

/** Snapshot of a detected room / floor */
export type RoomSnapshot = {
    id: string; // unique identifier
    area: number;
    polygon: { x: number; z: number }[];
};

/** Angle annotation at a corner node where two walls meet */
export type AngleDimensionSnapshot = {
    nodeId: number;
    wallId1: number;
    wallId2: number;
    /** Interior angle in degrees [5, 175] */
    angle: number;
    /** Arc start angle in degrees from +X axis (world space, CW in screen) */
    startAngle: number;
    /** Arc sweep in degrees (same as angle for 2-wall corners) */
    sweepAngle: number;
    cornerX: number; // world space
    cornerZ: number;
    /** Unit bisector vector pointing into the arc (world space) */
    bisectorX: number;
    bisectorZ: number;
};

/** Toàn bộ trạng thái scene mà ECS emit mỗi khi có thay đổi */
export type ECSSnapshot = {
    nodes: NodeSnapshot[];
    walls: WallSnapshot[];
    /** Node cap polygons to fill gaps at multi-wall junctions */
    caps: NodeCapSnapshot[];
    /** Detected rooms / floors */
    rooms: RoomSnapshot[];
    /** Wall dimension annotations */
    dimensions: DimensionSnapshot[];
    /** Angle annotations at wall corners */
    angleDimensions: AngleDimensionSnapshot[];
};

// ============================================================
// Event map
// ============================================================

export type EngineEventMap = {
    entitySelected:  { entityId: number | null };
    entityAdded:     { entityId: number; type?: string };
    entityRemoved:   { entityId: number };
    draggingChanged: { entityId: number | null; dragging: boolean };
    /** Phát ra mỗi frame khi có node/wall nào thay đổi. */
    snapshot:        ECSSnapshot;
};

type Handler<T> = (payload: T) => void;

/**
 * Typed EventBus nội bộ của Engine.
 * Hỗ trợ subscribe/unsubscribe type-safe.
 */
export class EngineEvents {
    private handlers = new Map<keyof EngineEventMap, Set<unknown>>();
    public lastSnapshot: ECSSnapshot | null = null;

    on<K extends keyof EngineEventMap>(type: K, handler: Handler<EngineEventMap[K]>): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as unknown);
        return () => {
            set?.delete(handler as unknown);
            if (set?.size === 0) this.handlers.delete(type);
        };
    }

    emit<K extends keyof EngineEventMap>(type: K, payload: EngineEventMap[K]) {
        if (type === "snapshot") {
            this.lastSnapshot = payload as unknown as ECSSnapshot;
        }
        const set = this.handlers.get(type);
        if (!set || set.size === 0) return;
        for (const handler of set) {
            (handler as Handler<EngineEventMap[K]>)(payload);
        }
    }
}
