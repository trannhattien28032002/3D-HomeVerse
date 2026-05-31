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
import { useEngineOrNull } from "src/app/engine/EngineContext";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

export type EngineApi = {
    dispatch: (cmd: EngineCommand) => void;
    withTransaction: (label: string, fn: () => void) => void;
    beginTransaction: (label: string) => void;
    commitTransaction: () => void;
    cancelTransaction: () => void;
    nextNodeId: () => number;
    nextWallId: () => number;
};

export function useEngineApi(): EngineApi {
    const engine = useEngineOrNull();

    function dispatch(cmd: EngineCommand) {
        if (!engine) {
            console.warn("[useEngineApi] dispatch called before engine init:", cmd.type);
            return;
        }
        engine.api.dispatch(cmd);
    }

    function withTransaction(label: string, fn: () => void) {
        if (!engine) { fn(); return; }
        engine.api.transaction(label, fn);
    }

    function beginTransaction(label: string) {
        engine?.api.beginTransaction(label);
    }

    function commitTransaction() {
        engine?.api.commitTransaction();
    }

    function cancelTransaction() {
        engine?.api.cancelTransaction();
    }

    function nextNodeId() {
        return engine?.nodes.nextAvailableNodeId() ?? 100;
    }

    function nextWallId() {
        return engine?.api.getNextIds()?.wallId ?? 50;
    }

    return { dispatch, withTransaction, beginTransaction, commitTransaction, cancelTransaction, nextNodeId, nextWallId };
}
