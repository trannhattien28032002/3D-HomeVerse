/**
 * Tất cả các lệnh (Command) mà UI có thể gửi vào ECS.
 * Không có logic ở đây — chỉ là data shape.
 *
 * Flow: UI dispatch(command) → engine xử lý → ECS thay đổi → SnapshotSystem emit
 */
export type EngineCommand =
    /** Tạo tường mới trong ECS + Three.js scene */
    | { type: "ADD_WALL";    wallId: number; x: number; z: number; w: number; d: number; rotY: number }

    /** Dịch chuyển tâm tường (chỉ x, z — y cố định = 0.5) */
    | { type: "MOVE_WALL";   wallId: number; x: number; z: number }

    /**
     * Cập nhật toàn bộ transform + kích thước tường sau khi resize/rotate trong Konva.
     * X, Z thay đổi vì tâm pivot có thể dịch chuyển khi scale.
     */
    | { type: "RESIZE_WALL"; wallId: number; x: number; z: number; w: number; d: number; rotY: number }

    /** Xóa tường khỏi ECS + Three.js scene, giải phóng geometry/material */
    | { type: "REMOVE_WALL"; wallId: number }

    /**
     * Bắt đầu kéo tường (chuyển từ StaticBody → DynamicBody để Rapier xử lý collision).
     * Gọi trước khi bắt đầu kéo.
     */
    | { type: "BEGIN_DRAG";  wallId: number }

    /**
     * Kết thúc kéo tường (chuyển từ DynamicBody → StaticBody).
     * Gọi sau khi thả tường.
     */
    | { type: "END_DRAG";    wallId: number };
