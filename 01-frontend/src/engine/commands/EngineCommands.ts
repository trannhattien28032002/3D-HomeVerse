/**
 * Tất cả các lệnh (Command) mà UI có thể gửi vào ECS.
 * Không có logic ở đây — chỉ là data shape.
 *
 * Flow: UI dispatch(command) → engine xử lý → ECS thay đổi → SnapshotSystem emit
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Node-driven topology                                    │
 * │  • Node có ID riêng — là source of truth                │
 * │  • Wall = derived từ (startNodeId, endNodeId)            │
 * │  • Moving a node automatically updates ALL walls         │
 * └─────────────────────────────────────────────────────────┘
 */
export type EngineCommand =

    // ── Node commands ──────────────────────────────────────────

    /**
     * Tạo một node mới tại vị trí world-space.
     * Engine trả về nodeId thông qua return value (synchronous).
     * Dùng khi bắt đầu vẽ tường ở vị trí mới (không snap).
     */
    | { type: "ENSURE_NODE"; nodeId: number; x: number; z: number }

    /**
     * Di chuyển node theo ID — cập nhật tất cả walls có chung node này.
     * Đây là lệnh duy nhất cho phép thay đổi hình dạng tường.
     */
    | { type: "MOVE_NODE"; nodeId: number; x: number; z: number }

    // ── Wall commands ──────────────────────────────────────────

    /**
     * Tạo tường mới nối hai node đã tồn tại.
     * Geometry được WallGeometrySystem tự tính từ node positions.
     */
    | { type: "ADD_WALL"; wallId: number; startNodeId: number; endNodeId: number; thickness: number }

    /** Xóa tường. Nodes không còn được dùng sẽ bị xóa tự động. */
    | { type: "REMOVE_WALL"; wallId: number }

    /**
     * Gộp sourceNodeId vào targetNodeId.
     * Tất cả walls kết nối với sourceNodeId sẽ được reroute sang targetNodeId.
     * sourceNodeId bị xóa sau khi gộp.
     * Dùng khi kéo node chồng lên node khác (snap-to-connect).
     */
    | { type: "MERGE_NODE"; sourceNodeId: number; targetNodeId: number }

    /**
     * Cắt một bức tường làm đôi tại một vị trí cụ thể (x, z).
     * Sẽ tạo ra một node mới và một tường mới. Tường cũ sẽ được cập nhật endNodeId thành newNodeId.
     */
    | { type: "SPLIT_WALL"; originalWallId: number; newWallId: number; newNodeId: number; x: number; z: number }

    /**
     * Tự động quét và xử lý các giao cắt của một bức tường mới/di chuyển với tất cả tường cũ.
     */
    | { type: "RESOLVE_INTERSECTIONS"; wallId: number }

    /**
     * Cập nhật thông số kích thước của một bức tường (thickness và/hoặc height).
     * Giá trị tính bằng world units. WallGeometrySystem sẽ rebuild mesh trên frame kế tiếp.
     */
    | { type: "UPDATE_WALL"; wallId: number; thickness?: number; height?: number }
;

