/**
 * useEngineApi — null-safe facade over engine.api for UI components.
 *
 * Renamed từ `useEngineDispatch` ở Đợt 4. Tên cũ gây hiểu nhầm vì hook không
 * chỉ wrap `dispatch` — nó còn wrap transactions + ID generators. Sau khi
 * rename, signature/behavior giữ nguyên — chỉ thay đổi tên.
 *
 * Lý do hook tồn tại (không inline vào caller):
 *   1. Null-safety: engine có thể chưa init ở first render. Hook tự warn/fallback.
 *   2. Stable shape: caller destructure 7 method 1 lần thay vì truy cập
 *      `engine.api.xxx` rải rác (đỡ "Cannot read property 'dispatch' of undefined").
 *   3. ToolContext compatibility: các tool nhận functions thuần qua context,
 *      không phải engine instance — giảm coupling tool ↔ engine internals.
 *
 * Note (REFACTOR-PLAN.md): plan ban đầu đề xuất xoá hook này hoàn toàn. Sau khi
 * audit thực tế, hook làm nhiều việc hơn null-check (xem dưới). Pragmatic
 * choice: rename để tên đúng nghĩa, giữ logic.
 */
import { useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { useEngineOrNull } from "src/app/engine/EngineContext";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

export type EngineApi = {
    dispatch: (cmd: EngineCommand) => void;
    dispatchAsync: (cmd: EngineCommand) => Promise<void>;
    withTransaction: (label: string, fn: () => void) => void;
    asyncTransaction: (label: string, fn: () => Promise<void>) => Promise<void>;
    beginTransaction: (label: string) => void;
    commitTransaction: () => void;
    cancelTransaction: () => void;
    /** Ghi command-inverse cho MOVE_FURNITURE (rẻ hơn snapshot toàn scene, R3). */
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    /** Ghi command-inverse cho ROTATE_FURNITURE (R3). */
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    /** Ghi command-inverse cho MOVE_WALL_ITEM (R3). */
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
    nextNodeId: () => string;
    nextWallId: () => string;
};

export function useEngineApi(): EngineApi {
    const engine = useEngineOrNull();

    // PERF: memoize the facade so its methods keep stable identity across renders.
    // engine is stable after init, so deps=[engine]. Without this, every render
    // produced fresh function identities, busting React.memo on layers that receive
    // dispatch/record*Undo as props (e.g. FurnitureLayer) — re-rendering all objects
    // on every pan/zoom frame regardless of other memoization.
    return useMemo<EngineApi>(() => ({
        dispatch(cmd: EngineCommand) {
            if (!engine) {
                console.warn("[useEngineApi] dispatch called before engine init:", cmd.type);
                return;
            }
            engine.api.dispatch(cmd);
        },

        dispatchAsync(cmd: EngineCommand): Promise<void> {
            if (!engine) {
                console.warn("[useEngineApi] dispatchAsync called before engine init:", cmd.type);
                return Promise.resolve();
            }
            return engine.api.dispatchAsync(cmd);
        },

        withTransaction(label: string, fn: () => void) {
            if (!engine) { fn(); return; }
            engine.api.transaction(label, fn);
        },

        asyncTransaction(label: string, fn: () => Promise<void>): Promise<void> {
            if (!engine) return fn();
            return engine.api.asyncTransaction(label, fn);
        },

        beginTransaction(label: string) {
            engine?.api.beginTransaction(label);
        },

        commitTransaction() {
            engine?.api.commitTransaction();
        },

        cancelTransaction() {
            engine?.api.cancelTransaction();
        },

        recordMoveUndo(entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) {
            engine?.api.recordMoveUndo(entityId, fromX, fromZ, toX, toZ);
        },

        recordRotateUndo(entityId: string, fromRotY: number, toRotY: number) {
            engine?.api.recordRotateUndo(entityId, fromRotY, toRotY);
        },

        recordWallItemMoveUndo(entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) {
            engine?.api.recordWallItemMoveUndo(entityId, fromHostWallId, fromT, fromSide, toHostWallId, toT, toSide);
        },

        nextNodeId() {
            return engine?.nodes.newNodeId() ?? uuidv4();
        },

        nextWallId() {
            return engine?.api.getNextIds()?.wallId ?? uuidv4();
        },
    }), [engine]);
}
