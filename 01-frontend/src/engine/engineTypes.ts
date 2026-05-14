import type { World } from "src/engine/ecs/World";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/** Named camera views available via the nav bar buttons. */
export type CameraPreset = "plan" | "perspective" | "eye-level";

export type EngineApi = {
    events: EngineEvents;
    dispatch: (command: EngineCommand) => void;
    clampNodeMove: (nodeId: number, newX: number, newZ: number) => { x: number; z: number };
    getNextIds: () => { nodeId: number; wallId: number };
    setView: (preset: CameraPreset) => void;
    rotateView: (angleDeg: number) => void;
    // ── Transaction + Undo ──────────────────────────────────────────────────
    /** Groups all dispatch() calls inside fn() into a single undoable history entry. */
    transaction: (label: string, fn: () => void) => void;
    /** Opens a transaction manually — use for drag operations that span multiple events. */
    beginTransaction: (label: string) => void;
    /** Closes the open transaction and commits it to undo history. */
    commitTransaction: () => void;
    /** Aborts the open transaction without pushing to history. */
    cancelTransaction: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
};

export type EngineInstance = {
    world: World;
    api: EngineApi;
    nodes: NodeRegistry;
    wallEntityByWallId: Map<number, number>;
    dispose: () => void;
};

declare global {
    interface Window {
        gameEngine?: EngineInstance;
    }
}
