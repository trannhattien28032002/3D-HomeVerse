/**
 * =============================================================================
 * DISPATCHER — Bộ xử lý lệnh trung tâm của engine HomeVerse (slim router)
 * =============================================================================
 *
 * Sau Đợt 3 (REFACTOR-PLAN.md): file này chỉ còn ROUTER. Logic mỗi command
 * sống trong `handlers/*Handlers.ts`. God-switch 787 LOC trước đây → 12 case
 * `case X: handleX(cmd, deps); break;` + default exhaustiveness check.
 *
 * MỤC ĐÍCH TỔNG THỂ
 * -----------------
 * Dispatcher là điểm trung tâm DUY NHẤT được phép mutation cấu trúc topology
 * (tường, node) và lifecycle (furniture spawn/dispose). Mọi thay đổi floor
 * plan phải đi qua đây — không có ngoại lệ. Áp dụng Command Pattern + ECS.
 *
 * LUỒNG DỮ LIỆU TỔNG QUAN
 * -----------------------
 *
 *   [UI Layer]
 *      │  Người dùng vẽ tường / kéo node / đặt furniture
 *      ▼
 *   dispatch(command: EngineCommand)
 *      │  Switch theo command.type → delegate sang handler
 *      ▼
 *   [Handler trong handlers/*]
 *      │  Mutation component data trong World
 *      │  Cập nhật NodeRegistry / wallEntityByWallId / Registries
 *      ▼
 *   [WallGeometrySystem] — frame kế: rebuild mesh cho entity thiếu WallPolygon
 *      ▼
 *   [SnapshotSystem] — sau WallGeometrySystem: emit "snapshot" event
 *      ▼
 *   [React] — subscribe "snapshot" → re-render PlanView2D
 *
 * TẠI SAO INVALIDATION THAY VÌ REBUILD NGAY?
 * ------------------------------------------
 * Drag MOVE_NODE liên tục → batch rebuild 1 lần/frame thay vì N lần/dispatch.
 * Mỗi handler chỉ REMOVE WallPolygon — WallGeometrySystem batch.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

import {
    handleEnsureNode,
    handleMoveNode,
    handleMoveNodes,
    handleMergeNode,
} from "src/engine/commands/handlers/nodeHandlers";
import {
    handleAddWall,
    handleRemoveWall,
    handleUpdateWall,
    handleSplitWall,
    handleResolveIntersections,
} from "src/engine/commands/handlers/wallHandlers";
import {
    handlePlaceFurniture,
    handlePlaceWallItem,
    handleMoveWallItem,
    handleDeleteFurniture,
    handleMoveFurniture,
    handleRotateFurniture,
    handleApplyFurnitureMaterial,
    handleResetFurnitureMaterial,
} from "src/engine/commands/handlers/furnitureHandlers";
import {
    handleSetWallMaterial,
    handleSetFloorMaterial,
    handleResetWallMaterial,
    handleResetFloorMaterial,
} from "src/engine/commands/handlers/surfaceHandlers";

// Re-export type để consumer (engine.ts, tests) không phải đổi import path.
export type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

/**
 * Factory function trả về hai hàm dispatch:
 *   - dispatch(command)       → void  (sync, giữ nguyên interface cũ)
 *   - dispatchAsync(command)  → Promise<void>  (async, dùng cho PLACE_FURNITURE / PLACE_WALL_ITEM)
 *
 * Deps được capture qua closure — handlers nhận (command, deps) trực tiếp,
 * không phải re-bind ở mỗi call.
 */
export function createDispatcher(deps: DispatcherDeps): {
    dispatch: (command: EngineCommand) => void;
    dispatchAsync: (command: EngineCommand) => Promise<void>;
} {
    function dispatchAsync(command: EngineCommand): Promise<void> {
        switch (command.type) {
            // ── Async placement commands — trả về Promise để caller await ──────
            case "PLACE_FURNITURE":       return handlePlaceFurniture(command, deps);
            case "PLACE_WALL_ITEM":       return handlePlaceWallItem(command, deps);

            // ── Tất cả command còn lại là sync — wrap thành Promise.resolve ────
            default:                      dispatch(command); return Promise.resolve();
        }
    }

    function dispatch(command: EngineCommand): void {
        switch (command.type) {
            // ── Node topology ─────────────────────────────────────────────────
            case "ENSURE_NODE":           handleEnsureNode(command, deps); break;
            case "MOVE_NODE":             handleMoveNode(command, deps); break;
            case "MOVE_NODES":            handleMoveNodes(command, deps); break;
            case "MERGE_NODE":            handleMergeNode(command, deps); break;

            // ── Wall CRUD + topology ──────────────────────────────────────────
            case "ADD_WALL":              handleAddWall(command, deps); break;
            case "REMOVE_WALL":           handleRemoveWall(command, deps); break;
            case "UPDATE_WALL":           handleUpdateWall(command, deps); break;
            case "SPLIT_WALL":            handleSplitWall(command, deps); break;
            case "RESOLVE_INTERSECTIONS": handleResolveIntersections(command, deps); break;

            // ── Furniture lifecycle ───────────────────────────────────────────
            // PLACE_FURNITURE và PLACE_WALL_ITEM chỉ nên gọi qua dispatchAsync().
            // Nếu vẫn gọi qua dispatch() (fire-and-forget), cảnh báo rõ ràng.
            case "PLACE_FURNITURE":
                console.warn("[dispatcher] PLACE_FURNITURE called via sync dispatch — undo will NOT be undo-safe. Use dispatchAsync() instead.");
                handlePlaceFurniture(command, deps);
                break;
            case "PLACE_WALL_ITEM":
                console.warn("[dispatcher] PLACE_WALL_ITEM called via sync dispatch — undo will NOT be undo-safe. Use dispatchAsync() instead.");
                handlePlaceWallItem(command, deps);
                break;
            case "MOVE_WALL_ITEM":        handleMoveWallItem(command, deps); break;
            case "DELETE_FURNITURE":      handleDeleteFurniture(command, deps); break;
            case "MOVE_FURNITURE":        handleMoveFurniture(command, deps); break;
            case "ROTATE_FURNITURE":      handleRotateFurniture(command, deps); break;
            case "APPLY_FURNITURE_MATERIAL": handleApplyFurnitureMaterial(command, deps); break;
            case "RESET_FURNITURE_MATERIAL": handleResetFurnitureMaterial(command, deps); break;

            // ── Surface material (tường + sàn) ────────────────────────────────
            case "SET_WALL_MATERIAL":     handleSetWallMaterial(command, deps); break;
            case "SET_FLOOR_MATERIAL":    handleSetFloorMaterial(command, deps); break;
            case "RESET_WALL_MATERIAL":   handleResetWallMaterial(command, deps); break;
            case "RESET_FLOOR_MATERIAL":  handleResetFloorMaterial(command, deps); break;

            // ── Exhaustiveness check ──────────────────────────────────────────
            // Nếu thêm 1 case mới vào EngineCommand mà quên handle ở đây, TS sẽ
            // báo error tại dòng `_exhaustive: never = command` — compile fail.
            // Runtime: log warn nếu deserialize file scene cũ có command đã rename.
            default: {
                const _exhaustive: never = command;
                void _exhaustive;
                console.warn("[dispatcher] Unknown command type:", (command as { type: string }).type);
                break;
            }
        }
    }

    return { dispatch, dispatchAsync };
}
