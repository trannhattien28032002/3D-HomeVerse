// ============================================================
// Snapshot types — dữ liệu ECS "chụp" ra cho UI mỗi frame
// ============================================================

/**
 * Snapshot của một tường từ ECS (world-space coords).
 * UI sẽ tự quy đổi sang pixel khi render.
 */
export type WallSnapshot = {
    wallId: number;
    x: number;
    y: number;
    z: number;
    w: number; // WallSize.length
    d: number; // WallSize.thickness
    rotY: number;
};

/** Toàn bộ trạng thái scene mà ECS emit mỗi khi có thay đổi */
export type ECSSnapshot = {
    walls: WallSnapshot[];
};

// ============================================================
// Event map
// ============================================================

export type EngineEventMap = {
    entitySelected:  { entityId: number | null };
    entityMoved:     { entityId: number; wallId?: number; x: number; y: number; z: number; w?: number; h?: number; d?: number; rotY?: number };
    entityAdded:     { entityId: number; type?: string };
    entityRemoved:   { entityId: number };
    draggingChanged: { entityId: number | null; dragging: boolean };
    /** Phát ra mỗi frame khi có wall nào thay đổi Transform/WallSize. */
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
