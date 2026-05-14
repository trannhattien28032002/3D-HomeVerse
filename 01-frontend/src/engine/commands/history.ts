import type { SceneDocument } from "src/engine/serialization/SceneDocument";

const MAX_HISTORY = 50;

type HistoryEntry = { label: string; snapshot: SceneDocument };

/**
 * Snapshot-based undo/redo stack.
 * Each entry stores the SceneDocument state BEFORE a transaction ran.
 * Undo restores that snapshot; redo re-applies the undone state.
 */
export class UndoHistory {
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];

    push(label: string, snapshot: SceneDocument): void {
        this.undoStack.push({ label, snapshot });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
        // Any new action clears the redo branch.
        this.redoStack = [];
    }

    canUndo(): boolean { return this.undoStack.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    /**
     * Pops the last undo entry and returns its snapshot.
     * Pushes currentSnapshot onto the redo stack so redo can reverse the undo.
     */
    undo(currentSnapshot: SceneDocument): SceneDocument | null {
        const entry = this.undoStack.pop();
        if (!entry) return null;
        this.redoStack.push({ label: entry.label, snapshot: currentSnapshot });
        return entry.snapshot;
    }

    /**
     * Pops the last redo entry and returns its snapshot.
     * Pushes currentSnapshot back onto the undo stack.
     */
    redo(currentSnapshot: SceneDocument): SceneDocument | null {
        const entry = this.redoStack.pop();
        if (!entry) return null;
        this.undoStack.push({ label: entry.label, snapshot: currentSnapshot });
        return entry.snapshot;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }
}
