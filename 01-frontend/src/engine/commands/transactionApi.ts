/**
 * transactionApi — phần transaction/undo/redo của EngineApi, tách khỏi createEngine.
 *
 * createEngine() vừa lắp ráp subsystem vừa định nghĩa cả máy trạng thái undo inline,
 * khiến phần "wiring" khó đọc. Factory này gom toàn bộ slice transaction (transaction
 * thường/async, begin/commit/cancel thủ công, undo/redo, và các record*Undo
 * command-inverse) vào một chỗ; engine.ts chỉ việc spread kết quả vào `api`.
 *
 * Dùng `instanceRef` (ref vòng) vì serializeScene/deserializeScene cần EngineInstance,
 * mà instance chỉ tồn tại ở cuối createEngine — ref được gán current sau đó.
 */
import { serializeScene } from "src/engine/serialization/serialize";
import { deserializeScene } from "src/engine/serialization/deserialize";
import type { UndoHistory } from "src/engine/commands/history";
import type { EngineApi, EngineInstance } from "src/engine/engineTypes";

/** Slice của EngineApi mà factory này cung cấp. */
export type TransactionApi = Pick<
    EngineApi,
    | "transaction"
    | "asyncTransaction"
    | "beginTransaction"
    | "commitTransaction"
    | "cancelTransaction"
    | "undo"
    | "redo"
    | "canUndo"
    | "canRedo"
    | "recordMoveUndo"
    | "recordRotateUndo"
    | "recordWallItemMoveUndo"
>;

export interface TransactionApiDeps {
    /** Ref vòng tới EngineInstance (gán current ở cuối createEngine). */
    instanceRef: { current: EngineInstance | null };
    undoHistory: UndoHistory;
    /** Dispatch cho undo/redo kiểu command-inverse (không teardown mesh). */
    dispatch: EngineApi["dispatch"];
}

export function createTransactionApi(deps: TransactionApiDeps): TransactionApi {
    const { instanceRef, undoHistory, dispatch } = deps;

    // pendingLabel/pendingSnapshot: giữ state của beginTransaction() đến commitTransaction().
    let pendingLabel: string | null = null;
    let pendingSnapshot: ReturnType<typeof serializeScene> | null = null;

    return {
        transaction(label, fn) {
            const inst = instanceRef.current;
            if (!inst) { fn(); return; }
            const snapshot = serializeScene(inst);
            fn();
            undoHistory.push(label, snapshot);
        },

        // snapshot trước → await fn → push history. Dùng cho PLACE_FURNITURE / PLACE_WALL_ITEM
        // (placement async undo-safe).
        async asyncTransaction(label, fn) {
            const inst = instanceRef.current;
            if (!inst) { await fn(); return; }
            const snapshot = serializeScene(inst);
            await fn();
            undoHistory.push(label, snapshot);
        },

        beginTransaction(label) {
            const inst = instanceRef.current;
            if (!inst) return;
            pendingLabel = label;
            pendingSnapshot = serializeScene(inst);
        },

        commitTransaction() {
            if (pendingSnapshot !== null && pendingLabel !== null) {
                undoHistory.push(pendingLabel, pendingSnapshot);
            }
            pendingLabel = null;
            pendingSnapshot = null;
        },

        cancelTransaction() {
            pendingLabel = null;
            pendingSnapshot = null;
        },

        undo() {
            const inst = instanceRef.current;
            if (!inst) return;
            // MD-05: thunk lazy — serializeScene chỉ chạy nếu entry là snapshot (topology),
            // không chạy cho move/rotate (command-inverse, hot path).
            const result = undoHistory.undo(() => serializeScene(inst));
            if (!result) return;
            if (result.kind === "snapshot") {
                // deserializeScene async (C1) — fire-and-forget; generation guard bên trong
                // xử lý undo/redo nhanh liên tiếp. Chỉ log nếu lỗi.
                void deserializeScene(result.snapshot, inst).catch(err => console.error("[engine] undo deserialize failed:", err));
            } else {
                // Command-inverse: dispatch ngược lại (không teardown mesh).
                dispatch(result.command);
            }
        },

        redo() {
            const inst = instanceRef.current;
            if (!inst) return;
            const result = undoHistory.redo(() => serializeScene(inst));
            if (!result) return;
            if (result.kind === "snapshot") {
                void deserializeScene(result.snapshot, inst).catch(err => console.error("[engine] redo deserialize failed:", err));
            } else {
                dispatch(result.command);
            }
        },

        canUndo: () => undoHistory.canUndo(),
        canRedo: () => undoHistory.canRedo(),

        recordMoveUndo(entityId, fromX, fromZ, toX, toZ) {
            undoHistory.pushInverse(
                "move furniture",
                { type: "MOVE_FURNITURE", entityId, x: fromX, z: fromZ },
                { type: "MOVE_FURNITURE", entityId, x: toX, z: toZ },
            );
        },

        recordRotateUndo(entityId, fromRotY, toRotY) {
            undoHistory.pushInverse(
                "rotate furniture",
                { type: "ROTATE_FURNITURE", entityId, rotY: fromRotY },
                { type: "ROTATE_FURNITURE", entityId, rotY: toRotY },
            );
        },

        recordWallItemMoveUndo(entityId, fromHostWallId, fromT, fromSide, toHostWallId, toT, toSide) {
            undoHistory.pushInverse(
                "move wall item",
                { type: "MOVE_WALL_ITEM", entityId, hostWallId: fromHostWallId, t: fromT, side: fromSide },
                { type: "MOVE_WALL_ITEM", entityId, hostWallId: toHostWallId, t: toT, side: toSide },
            );
        },
    };
}
