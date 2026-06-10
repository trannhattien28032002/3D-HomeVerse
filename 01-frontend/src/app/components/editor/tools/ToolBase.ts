/**
 * ToolBase — interface chung cho tất cả tool trong PlanView2D.
 *
 * Kiến trúc Tool Pattern:
 *   PlanView2D (host) ↔ ToolBase (interface) ← DrawWallTool / SelectTool
 *
 * Host gọi:
 *   - update(ctx) mỗi render → sync context mới nhất
 *   - onStageMouseDown/Click/Move/ContextMenu → delegate input events
 *   - getWallProps(wall) → lấy Konva props để spread lên từng wall shape
 *   - renderOverlay() → render Konva Layers đặc thù của tool
 *   - onCancel() khi Escape / undo / switch tool
 *   - deactivate() khi tool bị thay bằng tool khác
 *
 * ToolContext chứa tất cả data mà tool cần, được push từ host mỗi render.
 * Không có closure stale — luôn có data mới nhất.
 */
import type React from "react";
import type { KonvaEventObject } from "konva/lib/Node";

import type { Node2D, Wall2D, Furniture2D } from "src/app/store/useFloorPlanSnapshot";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

/** Props mà tool trả về cho mỗi wall Konva shape — spread trực tiếp vào <Line>. */
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

/**
 * Runtime context — host push xuống tool mỗi render.
 * Tool lưu vào this.ctx và dùng trong handlers (không capture stale closure).
 */
export type ToolContext = {
    nodes: Node2D[];
    walls: Wall2D[];
    furniture: Furniture2D[];                     // nội thất đã đặt (px) — dùng cho 2D collision
    originX: number;                              // viewport center px
    originY: number;
    stageScale: number;                           // current zoom level
    stageScaleRef: { current: number };           // ref để đọc trong event handler (không stale)
    stagePosRef: { current: { x: number; y: number } }; // pan offset ref
    nodeById: Map<string, Node2D>;                // O(1) lookup node theo ID

    // Selection state — owned bởi host (cần cho WallPropertiesPanel và status bar)
    selectedWallIds: Set<string>;
    setSelectedWallIds: React.Dispatch<React.SetStateAction<Set<string>>>;

    // Engine commands — tool dispatch để thay đổi ECS
    dispatch: (cmd: EngineCommand) => void;
    /** Async dispatch cho PLACE_FURNITURE / PLACE_WALL_ITEM (trả về Promise). */
    dispatchAsync: (cmd: EngineCommand) => Promise<void>;
    withTransaction: (label: string, fn: () => void) => void;
    /**
     * Async transaction — snapshot trước → await fn() → push history.
     * Dùng cho placement để undo xóa được entity đã spawn.
     */
    asyncTransaction: (label: string, fn: () => Promise<void>) => Promise<void>;
    beginTransaction: (label: string) => void;
    commitTransaction: () => void;
    cancelTransaction: () => void;
    nextNodeId: () => string;
    nextWallId: () => string;

    // Scale-compensated helpers — tool không cần biết stageScale trực tiếp
    ss: (px: number) => number; // screen-stable size (text/stroke)
    sh: (px: number) => number; // handle-stable size

    // Yêu cầu host re-render khi tool thay đổi imperative state
    requestUpdate: () => void;
};

export interface ToolBase {
    /** Host gọi mỗi render để sync context mới nhất. */
    update(ctx: ToolContext): void;

    // Stage events — host xử lý pan/zoom trước, sau đó delegate xuống đây
    onStageMouseDown(e: KonvaEventObject<MouseEvent>): void;
    onStageClick(e: KonvaEventObject<MouseEvent>): void;
    onStageMouseMove(e: KonvaEventObject<MouseEvent>): void;
    onStageContextMenu(e: KonvaEventObject<MouseEvent>): void;

    /** Hủy thao tác đang dở (Escape, undo, switch tool). */
    onCancel(): void;

    /** Trả về Konva props cho mỗi wall shape — host spread vào <Line>. */
    getWallProps(wall: Wall2D): WallHandlers;

    /** Render Konva Layers đặc thù của tool (handles, preview line, highlights). */
    renderOverlay(): React.ReactNode;

    /** Dọn sạch internal state khi tool bị deactivate. */
    deactivate(): void;
}
