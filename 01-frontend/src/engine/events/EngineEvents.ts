/**
 * EngineEvents — EventBus nội bộ của engine + tất cả snapshot types.
 *
 * Event flow:
 *   ECS Systems (SnapshotSystem) → events.emit("snapshot", data)
 *   → useFloorPlanSnapshot.on("snapshot") → setSnap → PlanView2D re-render
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
    id: string;
    x: number; // world-space
    z: number;
};

/**
 * Snapshot của một tường.
 * UI dùng `polygon` để vẽ miter-cut shape.
 * `startNodeId` / `endNodeId` để biết node nào là endpoint.
 */
export type WallSnapshot = {
    wallId: string;
    startNodeId: string;
    endNodeId: string;
    thickness: number;
    height: number;
    /** Tâm hộp bao AABB (world-space) — dùng cho label */
    cx: number;
    cz: number;
    /** 4 góc đã cắt miter, theo world-space */
    polygon?: { x: number; z: number }[];
};

/** Chú thích kích thước (dimension) cho một đoạn tường */
export type DimensionSnapshot = {
    wallId: string;
    length: number;  // đơn vị thế giới (mét)
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    /** Vector đơn vị vuông góc với tường (về bên trái của hướng start→end) */
    perpX: number;
    perpZ: number;
};

/** Đa giác lấp khe tại node giao của 3+ tường */
export type NodeCapSnapshot = {
    nodeId: string;
    polygon: { x: number; z: number }[];
};

/** Snapshot của một phòng / sàn đã phát hiện */
export type RoomSnapshot = {
    id: string; // định danh duy nhất (room-${entity}) — KHÔNG bền qua rebuild topology
    /** Khóa phòng bền (sorted nodeIds) — dùng để gắn material sàn. */
    key: string;
    area: number;
    polygon: { x: number; z: number }[];
};

/** Chú thích góc tại node nơi hai tường gặp nhau */
export type AngleDimensionSnapshot = {
    nodeId: string;
    wallId1: string;
    wallId2: string;
    /** Góc trong, đơn vị độ [5, 175] */
    angle: number;
    /** Góc bắt đầu của cung, độ tính từ trục +X (world space, CW trên màn hình) */
    startAngle: number;
    /** Độ quét của cung, đơn vị độ (bằng angle với góc 2 tường) */
    sweepAngle: number;
    cornerX: number; // world space
    cornerZ: number;
    /** Vector phân giác đơn vị hướng vào trong cung (world space) */
    bisectorX: number;
    bisectorZ: number;
};

/**
 * Snapshot của một món nội thất đã đặt.
 * Cho phép PlanView2D vẽ furniture top-down mà không đọc ECS trực tiếp.
 * x/z/rotY từ Transform; width/depth là footprint XZ (mét).
 * topDownUrl: URL ảnh PNG top-down (nếu có trong catalog), dùng để vẽ hình ảnh thực.
 */
export type FurnitureSnapshot = {
    entityId: string;
    modelId: string;
    x: number;  // world-space (mét)
    z: number;
    rotY: number; // radian, quay quanh trục Y
    width: number; // footprint XZ (mét)
    depth: number;
    /** URL ảnh top-down từ catalog. Undefined = vẽ hộp xám fallback. */
    topDownUrl: string | undefined;
    // Wall-item metadata (undefined cho floor furniture)
    isWallItem?: boolean;
    wallBehavior?: "opening" | "mount";
    hostWallId?: string;
    /** Vị trí dọc tim tường, 0..1 (0 = node start, 1 = node end). */
    wallT?: number;
    /** Mặt tường: +1 = pháp tuyến dương, −1 = pháp tuyến âm. */
    wallSide?: number;
    /** Bề rộng lỗ khoét (mét) — chỉ có khi wallBehavior = "opening". */
    cutWidth?: number;
    /** Chiều cao lỗ khoét (mét) — chỉ có khi wallBehavior = "opening". */
    cutHeight?: number;
    /** Cao độ mép dưới lỗ so với sàn (mét) — 0 = cửa đi, > 0 = cửa sổ. */
    sill?: number;
    /** Wall-item chồng chỗ với item khác trên cùng tường (derived) → cảnh báo đỏ ở 2D. */
    overlapping?: boolean;
};

/** Toàn bộ trạng thái scene mà ECS emit mỗi khi có thay đổi */
export type ECSSnapshot = {
    nodes: NodeSnapshot[];
    walls: WallSnapshot[];
    /** Đa giác cap lấp khe tại các node giao nhiều tường */
    caps: NodeCapSnapshot[];
    /** Các phòng / sàn đã phát hiện */
    rooms: RoomSnapshot[];
    /** Chú thích kích thước tường */
    dimensions: DimensionSnapshot[];
    /** Chú thích góc tại các góc tường */
    angleDimensions: AngleDimensionSnapshot[];
    /** Các món nội thất đã đặt — chiếu xuống khung nhìn 2D */
    furniture: FurnitureSnapshot[];
};

// ============================================================
// Event map
// ============================================================

export type EngineEventMap = {
    entitySelected: { entityId: string | null };
    /**
     * Chọn một bề mặt tường trong 3D để đổi material (raycast trúng mesh tường).
     * KHÔNG attach gizmo → tường chỉ chọn được để tô material, không di chuyển/xoay.
     * wallId = null khi bỏ chọn.
     */
    wallSelected: { wallId: string | null };
    /**
     * Chọn mặt sàn của một phòng trong 3D để đổi material (raycast trúng room floor mesh).
     * KHÔNG attach gizmo. roomKey = null khi bỏ chọn.
     */
    floorSelected: { roomKey: string | null };
    entityAdded: { entityId: string; type?: string };
    entityRemoved: { entityId: string };
    draggingChanged: { entityId: string | null; dragging: boolean };
    gizmoModeChanged: { mode: "translate" | "rotate" };
    /** Phát ra mỗi frame khi có node/wall nào thay đổi. */
    snapshot: ECSSnapshot;
    placementStarted: { modelId: string };
    placementConfirmed: { modelId: string; x: number; z: number };
    placementCancelled: Record<never, never>;
    /** Phát ngay khi begin() được gọi, trước khi GLB nạp xong. */
    placementLoading: { modelId: string };
    /** Phát khi ghost GLB đã sẵn sàng và hiển thị trên mặt sàn. */
    placementReady: { modelId: string };
    /** Phát khi GLB nạp lỗi trong lúc đặt đồ. */
    placementError: { modelId: string; error: string };
    /**
     * Phát khi từ chối đặt thêm đồ vì đã chạm trần số lượng (chống spam).
     * `count` = số đồ hiện có; `limit` = trần (MAX_FURNITURE_ENTITIES). UI hiển thị
     * toast cảnh báo. Xem engine/utils/furnitureLimit.ts.
     */
    entityLimitReached: { count: number; limit: number };
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
