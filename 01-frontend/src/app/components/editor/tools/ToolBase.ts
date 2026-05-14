import type React from "react";
import type { KonvaEventObject } from "konva/lib/Node";

import type { Node2D, Wall2D } from "src/app/store/useFloorPlanStore";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

// ── Per-wall props returned by each tool ──────────────────────────────────────

export type WallHandlers = {
    fill: string;
    stroke: string;
    draggable: boolean;
    onMouseDown?: (e: KonvaEventObject<MouseEvent>) => void;
    onTap?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDragStart?: (e: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDragMove?: (e: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDragEnd?: (e: any) => void;
};

// ── Runtime context passed to every tool on each render ───────────────────────

export type ToolContext = {
    nodes: Node2D[];
    walls: Wall2D[];
    originX: number;
    originY: number;
    stageScale: number;
    stageScaleRef: { current: number };
    stagePosRef: { current: { x: number; y: number } };
    nodeById: Map<number, Node2D>;

    // Selection state is owned by the host (needed for WallPropertiesPanel and status bar)
    selectedWallIds: Set<number>;
    setSelectedWallIds: React.Dispatch<React.SetStateAction<Set<number>>>;

    // Engine commands
    dispatch: (cmd: EngineCommand) => void;
    withTransaction: (label: string, fn: () => void) => void;
    beginTransaction: (label: string) => void;
    commitTransaction: () => void;
    cancelTransaction: () => void;
    nextNodeId: () => number;
    nextWallId: () => number;

    // Scale-compensated size helpers (passed so tools don't need stageScale directly)
    ss: (px: number) => number;
    sh: (px: number) => number;

    // Trigger a host re-render when tool changes imperative state (e.g. draw preview)
    requestUpdate: () => void;
};

// ── ToolBase interface ────────────────────────────────────────────────────────

export interface ToolBase {
    /** Called by the host on every render to sync the latest context. */
    update(ctx: ToolContext): void;

    // Stage-level events (host handles pan/zoom, then delegates the rest here)
    onStageMouseDown(e: KonvaEventObject<MouseEvent>): void;
    onStageClick(e: KonvaEventObject<MouseEvent>): void;
    onStageMouseMove(e: KonvaEventObject<MouseEvent>): void;
    onStageContextMenu(e: KonvaEventObject<MouseEvent>): void;

    /** Cancel in-progress interaction (Escape key, undo, tool switch). */
    onCancel(): void;

    /** Per-wall event handlers spread onto each wall's Konva shape. */
    getWallProps(wall: Wall2D): WallHandlers;

    /** Tool-specific Konva overlay (Layers of handles, highlights, preview). */
    renderOverlay(): React.ReactNode;

    /** Clean up all internal state when this tool is deactivated. */
    deactivate(): void;
}
