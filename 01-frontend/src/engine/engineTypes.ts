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
import type { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import type { WallFace } from "src/engine/components/render/SurfaceMaterial";

/** Tên camera preset — xem định nghĩa góc nhìn cụ thể trong OrbitControlSystem.ts */
export type CameraPreset = "plan" | "perspective" | "eye-level";

/**
 * Dữ liệu copy của một món nội thất ĐẶT SÀN — đủ để tái tạo bản sao qua PLACE_FURNITURE.
 * Chỉ áp dụng cho đồ đặt sàn (không phải cửa/kệ bám tường). Plain data → giữ được
 * trong clipboard ngoài React state, dán lại nhiều lần.
 */
export type FurnitureClipboard = {
    modelId: string;
    x: number;
    y: number;
    z: number;
    /** Góc yaw quanh trục Y (radian). */
    rotY: number;
    /** Map slotId → variantId các material đã đổi (rỗng nếu dùng material gốc). */
    materials: Record<string, string>;
};

/**
 * Public API của engine — React layer chỉ được dùng các method này.
 * Không truy cập World hay NodeRegistry trực tiếp từ UI.
 */
export type EngineApi = {
    /** EventBus nội bộ — subscribe "snapshot" để nhận trạng thái scene mỗi frame. */
    events: EngineEvents;
    /** Gửi command vào dispatcher — cách duy nhất để thay đổi trạng thái ECS từ UI. */
    dispatch: (command: EngineCommand) => void;
    /**
     * Gửi command async (PLACE_FURNITURE / PLACE_WALL_ITEM) và trả về Promise.
     * Dùng trong asyncTransaction để đảm bảo entity đã tồn tại trước khi snapshot.
     */
    dispatchAsync: (command: EngineCommand) => Promise<void>;
    clampNodeMove: (nodeId: string, newX: number, newZ: number) => { x: number; z: number };
    /** Sinh nodeId và wallId uuid mới cho thao tác kế tiếp. */
    getNextIds: () => { nodeId: string; wallId: string };
    /** Chuyển camera sang preset (plan / perspective / eye-level) với animation. */
    setView: (preset: CameraPreset) => void;
    /** Xoay camera ngang angleDeg độ quanh điểm nhìn hiện tại. */
    rotateView: (angleDeg: number) => void;
    /** Chuyển gizmo 3D giữa translate (di chuyển) và rotate (xoay). No-op khi đang drag. */
    setGizmoMode: (mode: "translate" | "rotate") => void;
    /** Bỏ chọn mọi thứ trong 3D (gỡ gizmo + dọn viền chọn + đồng bộ store). */
    clearSelection: () => void;
    /**
     * Chụp khung hình 3D hiện tại tại đúng vị trí camera đang đứng.
     * Tự bỏ chọn trước khi chụp để ảnh không dính gizmo / viền chọn.
     * Trả về data URL PNG — render đồng bộ 1 frame rồi đọc canvas ngay trong cùng tick.
     */
    captureScreenshot: () => string;
    // ── Transaction + Undo ──────────────────────────────────────────────────
    /** Gom tất cả dispatch() bên trong fn() thành một entry undo duy nhất. */
    transaction: (label: string, fn: () => void) => void;
    /**
     * Phiên bản async của transaction — snapshot TRƯỚC fn → await fn() → push history.
     * Dùng cho PLACE_FURNITURE / PLACE_WALL_ITEM để undo xóa được entity đã spawn.
     */
    asyncTransaction: (label: string, fn: () => Promise<void>) => Promise<void>;
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
    /**
     * Ghi command-inverse cho MOVE_FURNITURE — rẻ hơn snapshot toàn scene.
     * Gọi sau khi MOVE_FURNITURE dispatch xong (biết cả from + to).
     * Undo = dispatch MOVE_FURNITURE với {x: fromX, z: fromZ}.
     */
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    /**
     * Ghi command-inverse cho ROTATE_FURNITURE — rẻ hơn snapshot toàn scene.
     * Gọi sau khi ROTATE_FURNITURE dispatch xong.
     * Undo = dispatch ROTATE_FURNITURE với rotY cũ.
     */
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    /**
     * Ghi command-inverse cho MOVE_WALL_ITEM — rẻ hơn snapshot toàn scene (R3).
     * Undo = dispatch MOVE_WALL_ITEM với topology tường cũ.
     */
    recordWallItemMoveUndo: (
        entityId: string,
        fromHostWallId: string, fromT: number, fromSide: number,
        toHostWallId: string, toT: number, toSide: number,
    ) => void;
    /** Vào chế độ đặt đồ xem-trước (ghost) cho model cho trước. */
    beginPlacement: (modelId: string) => void;
    /** Huỷ phiên đặt đồ đang chạy (nếu có) và gỡ ghost. */
    cancelPlacement: () => void;
    // ── Material read ─────────────────────────────────────────────────────────
    /** Trả về map slotId → materialId hiện tại của entity (đồ nội thất). */
    getEntityMaterials: (entityId: string) => Record<string, string>;
    /** Trả về materialId hiện tại của MỘT MẶT tường (left/right), hoặc null nếu chưa đổi. */
    getWallMaterial: (wallId: string, face: WallFace) => string | null;
    /** Trả về materialId hiện tại của sàn phòng (theo roomKey), hoặc null. */
    getFloorMaterial: (roomKey: string) => string | null;
    /**
     * Đọc dữ liệu copy của một entity ĐẶT SÀN (modelId + transform + materials).
     * Trả về null nếu entity không phải đồ đặt sàn (vd cửa/kệ bám tường, hoặc không
     * có Model3D) → caller (Ctrl+C) bỏ qua, không copy.
     */
    getFurnitureClipboard: (entityId: string) => FurnitureClipboard | null;
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
    /** Ánh xạ wallId (uuid) → ECS entityId (uuid) — cần thiết cho serialize và dispatcher. */
    wallEntityByWallId: Map<string, string>;
    /** PBR material catalog + KTX2 loader — dùng để apply texture lên tường/sàn/đồ vật. */
    materialLibrary: MaterialLibrary;
    /**
     * Material sàn theo roomKey (sorted nodeIds) → materialId — chia sẻ với dispatcher
     * và RoomSystem. serialize đọc để lưu; deserialize ghi lại qua SET_FLOOR_MATERIAL.
     */
    floorMaterials: Map<string, string>;
    /** Dọn dẹp toàn bộ Three.js objects, event listeners, physics khi unmount. */
    dispose: () => void;
};

declare global {
    interface Window {
        /** Cổng debug toàn cục — cho phép inspect engine từ DevTools console. */
        gameEngine?: EngineInstance;
    }
}
