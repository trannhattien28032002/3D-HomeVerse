/**
 * Undo/redo stack — hỗ trợ hai loại entry:
 *
 * 1. Snapshot entry (topology): mỗi entry lưu SceneDocument ngay TRƯỚC khi transaction chạy.
 *    Dùng cho ADD/REMOVE wall, PLACE/DELETE furniture — các lệnh thay đổi mesh Three.js.
 *    Undo: pop snapshot cũ → deserializeScene. Chi phí O(scene size).
 *
 * 2. Command-inverse entry (R3): lưu cặp (undoCommand, redoCommand) để dispatch ngược lại.
 *    Dùng cho MOVE_FURNITURE / ROTATE_FURNITURE — gesture phổ biến, không cần teardown mesh.
 *    Undo: dispatch undoCommand. Chi phí O(1) — không deserialize.
 *
 * Tại sao giữ snapshot cho topology:
 *   - Đơn giản và an toàn cho ADD_WALL / PLACE_FURNITURE.
 *   - SceneDocument nhỏ (chỉ node positions + wall topology), không phải mesh data.
 *
 * Tại sao thêm command-inverse cho move/rotate:
 *   - MOVE/ROTATE là gesture phổ biến nhất, xảy ra mỗi lần kéo đồ.
 *   - Serialize/deserialize toàn scene = teardown + rebuild Three.js mesh → expensive.
 *   - Inverse command rẻ: chỉ lưu {entityId, fromPos/fromRot} → dispatch ngược.
 *
 * Giới hạn: MAX_HISTORY = 50 entry để tránh tốn memory.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { SceneDocument } from "src/engine/serialization/SceneDocument";

const MAX_HISTORY = 50;

type SnapshotEntry = {
    kind: "snapshot";
    label: string;
    snapshot: SceneDocument;
};

type InverseEntry = {
    kind: "inverse";
    label: string;
    /** Command để dispatch khi undo (ngược chiều thao tác đã làm). */
    undoCommand: EngineCommand;
    /** Command để dispatch khi redo (tái áp dụng thao tác). */
    redoCommand: EngineCommand;
};

type HistoryEntry = SnapshotEntry | InverseEntry;

/**
 * Kết quả undo/redo:
 *   - { kind: "snapshot", snapshot } → deserializeScene
 *   - { kind: "inverse", command }   → dispatch command
 */
export type UndoResult =
    | { kind: "snapshot"; snapshot: SceneDocument }
    | { kind: "inverse"; command: EngineCommand };

export class UndoHistory {
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];

    /**
     * Đẩy snapshot vào undo stack (topology operations).
     * Gọi ngay SAU khi chụp trạng thái TRƯỚC transaction (không phải sau).
     * Mọi push mới sẽ xóa sạch redo stack.
     */
    push(label: string, snapshot: SceneDocument): void {
        this.undoStack.push({ kind: "snapshot", label, snapshot });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];
    }

    /**
     * Đẩy cặp inverse command vào undo stack (move/rotate furniture).
     * Không cần snapshot — undo/redo = dispatch command ngược.
     * Mọi push mới sẽ xóa sạch redo stack.
     */
    pushInverse(label: string, undoCommand: EngineCommand, redoCommand: EngineCommand): void {
        this.undoStack.push({ kind: "inverse", label, undoCommand, redoCommand });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];
    }

    canUndo(): boolean { return this.undoStack.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    /**
     * Pop entry undo cuối → trả kết quả để restore.
     * Đẩy entry đảo ngược lên redo stack để redo có thể hoàn tác lại lần undo này.
     *
     * @param currentSnapshot Trạng thái hiện tại — cần để push lên redo stack
     *   (chỉ dùng khi entry là snapshot; với inverse entry, redo stack lưu inverse ngược)
     */
    undo(currentSnapshot: SceneDocument): UndoResult | null {
        const entry = this.undoStack.pop();
        if (!entry) return null;

        if (entry.kind === "snapshot") {
            this.redoStack.push({ kind: "snapshot", label: entry.label, snapshot: currentSnapshot });
            return { kind: "snapshot", snapshot: entry.snapshot };
        } else {
            // Inverse: redo = redoCommand; undo đã áp dụng undoCommand.
            this.redoStack.push({ kind: "inverse", label: entry.label, undoCommand: entry.undoCommand, redoCommand: entry.redoCommand });
            return { kind: "inverse", command: entry.undoCommand };
        }
    }

    /**
     * Pop entry redo cuối → trả kết quả để re-apply.
     * Đẩy entry đảo ngược lên undo stack để có thể undo lại redo này.
     */
    redo(currentSnapshot: SceneDocument): UndoResult | null {
        const entry = this.redoStack.pop();
        if (!entry) return null;

        if (entry.kind === "snapshot") {
            this.undoStack.push({ kind: "snapshot", label: entry.label, snapshot: currentSnapshot });
            return { kind: "snapshot", snapshot: entry.snapshot };
        } else {
            this.undoStack.push({ kind: "inverse", label: entry.label, undoCommand: entry.undoCommand, redoCommand: entry.redoCommand });
            return { kind: "inverse", command: entry.redoCommand };
        }
    }

    /** Xóa cả undo và redo stack — gọi khi engine.dispose(). */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }
}
