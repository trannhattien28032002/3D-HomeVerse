/**
 * Các type trung tâm của engine — không chứa logic, chỉ khai báo shape.
 *
 * EngineApi:      interface mà React layer dùng để điều khiển engine
 *                 (dispatch command, undo/redo, camera, transaction)
 * EngineInstance: object đầy đủ được mount vào EngineContext và window.gameEngine
 * CameraPreset:   tên các góc nhìn camera được định nghĩa trong OrbitControlSystem
 */
import type { World } from "src/engine/ecs/World";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/** Tên camera preset — xem định nghĩa góc nhìn cụ thể trong OrbitControlSystem.ts */
export type CameraPreset = "plan" | "perspective" | "eye-level";

/**
 * Public API của engine — React layer chỉ được dùng các method này.
 * Không truy cập World hay NodeRegistry trực tiếp từ UI.
 */
export type EngineApi = {
    /** EventBus nội bộ — subscribe "snapshot" để nhận trạng thái scene mỗi frame. */
    events: EngineEvents;
    /** Gửi command vào dispatcher — cách duy nhất để thay đổi trạng thái ECS từ UI. */
    dispatch: (command: EngineCommand) => void;
    clampNodeMove: (nodeId: number, newX: number, newZ: number) => { x: number; z: number };
    /** Lấy nodeId và wallId tiếp theo có thể dùng (chưa bị chiếm). */
    getNextIds: () => { nodeId: number; wallId: number };
    /** Chuyển camera sang preset (plan / perspective / eye-level) với animation. */
    setView: (preset: CameraPreset) => void;
    /** Xoay camera ngang angleDeg độ quanh điểm nhìn hiện tại. */
    rotateView: (angleDeg: number) => void;
    // ── Transaction + Undo ──────────────────────────────────────────────────
    /** Gom tất cả dispatch() bên trong fn() thành một entry undo duy nhất. */
    transaction: (label: string, fn: () => void) => void;
    /** Mở transaction thủ công — dùng cho thao tác kéo thả trải dài nhiều event. */
    beginTransaction: (label: string) => void;
    /** Đóng transaction và đẩy vào undo stack. */
    commitTransaction: () => void;
    /** Hủy transaction đang mở mà không push lên undo stack. */
    cancelTransaction: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
};

/**
 * Object engine đầy đủ — được cấp phát bởi createEngine() và chia sẻ qua:
 *   - EngineContext.Provider (cho React components)
 *   - window.gameEngine       (backward-compat, debug)
 */
export type EngineInstance = {
    world: World;
    api: EngineApi;
    /** NodeRegistry — topology graph của tất cả node/wall. */
    nodes: NodeRegistry;
    /** Ánh xạ wallId → ECS entityId — cần thiết cho serialize và dispatcher. */
    wallEntityByWallId: Map<number, number>;
    /** Dọn dẹp toàn bộ Three.js objects, event listeners, physics khi unmount. */
    dispose: () => void;
};

declare global {
    interface Window {
        /** Cổng debug toàn cục — cho phép inspect engine từ DevTools console. */
        gameEngine?: EngineInstance;
    }
}
