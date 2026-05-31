/**
 * Undo/redo stack dựa trên snapshot toàn bộ scene.
 *
 * Chiến lược: mỗi entry lưu SceneDocument ngay TRƯỚC khi transaction chạy.
 *   - Undo: pop snapshot cũ → deserializeScene → push trạng thái hiện tại vào redo stack
 *   - Redo: pop snapshot redo → deserializeScene → push trạng thái hiện tại vào undo stack
 *
 * Tại sao snapshot toàn bộ thay vì command-based:
 *   - Đơn giản và an toàn — không cần implement "inverse command" cho từng loại thao tác
 *   - SceneDocument nhỏ (chỉ node positions + wall topology), không phải mesh data
 *
 * Giới hạn: MAX_HISTORY = 50 entry để tránh tốn memory.
 */
import type { SceneDocument } from "src/engine/serialization/SceneDocument";

const MAX_HISTORY = 50;

type HistoryEntry = { label: string; snapshot: SceneDocument };

export class UndoHistory {
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];

    /**
     * Đẩy snapshot vào undo stack.
     * Gọi ngay SAU khi chụp trạng thái TRƯỚC transaction (không phải sau).
     * Mọi push mới sẽ xóa sạch redo stack.
     */
    push(label: string, snapshot: SceneDocument): void {
        this.undoStack.push({ label, snapshot });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
        // Bất kỳ hành động mới nào đều xóa nhánh redo
        this.redoStack = [];
    }

    canUndo(): boolean { return this.undoStack.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    /**
     * Pop entry undo cuối → trả snapshot cũ để restore.
     * Đẩy currentSnapshot lên redo stack để redo có thể hoàn tác lại lần undo này.
     * @param currentSnapshot Trạng thái hiện tại (trước khi undo) — cần cho redo
     */
    undo(currentSnapshot: SceneDocument): SceneDocument | null {
        const entry = this.undoStack.pop();
        if (!entry) return null;
        this.redoStack.push({ label: entry.label, snapshot: currentSnapshot });
        return entry.snapshot;
    }

    /**
     * Pop entry redo cuối → trả snapshot để re-apply.
     * Đẩy currentSnapshot lên undo stack để có thể undo lại redo này.
     */
    redo(currentSnapshot: SceneDocument): SceneDocument | null {
        const entry = this.redoStack.pop();
        if (!entry) return null;
        this.undoStack.push({ label: entry.label, snapshot: currentSnapshot });
        return entry.snapshot;
    }

    /** Xóa cả undo và redo stack — gọi khi engine.dispose(). */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }
}
