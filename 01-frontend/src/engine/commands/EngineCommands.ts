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
 * │  • Di chuyển một node tự động cập nhật MỌI tường liên quan│
 * └─────────────────────────────────────────────────────────┘
 */
import type { WallFace } from "src/engine/components/render/SurfaceMaterial";

export type EngineCommand =

    // ── Node commands ──────────────────────────────────────────

    /**
     * Tạo một node mới tại vị trí world-space.
     * Engine trả về nodeId thông qua return value (synchronous).
     * Dùng khi bắt  đầu vẽ tường ở vị trí mới (không snap).
     */
    | { type: "ENSURE_NODE"; nodeId: string; x: number; z: number }

    /**
     * Di chuyển node theo ID — cập nhật tất cả walls có chung node này.
     * Đây là lệnh duy nhất cho phép thay đổi hình dạng tường.
     *
     * Wrapper 1-node của MOVE_NODES. Reconcile item LUÔN bật trong handler (cửa/kệ
     * trên tường bị reshape được giữ đứng yên — khoảng cách tới node neo bất biến).
     */
    | { type: "MOVE_NODE"; nodeId: string; x: number; z: number }

    /**
     * Dời NHIỀU node trong MỘT thao tác atomic — đường DUY NHẤT dời node. Dùng cho
     * tịnh tiến cứng thân tường (dời cả 2 node cùng delta). Chụp chiều dài tường TRƯỚC,
     * áp tất cả move, reconcile item MỘT lần: tường rigid (cả 2 node dời) là no-op;
     * tường hàng xóm (1 node dời) được reshape giữ item đứng yên. Thay chuỗi 2×MOVE_NODE
     * (tránh trạng thái trung gian sai — không cần cờ preserveItems/excludeWallId).
     */
    | { type: "MOVE_NODES"; moves: { nodeId: string; x: number; z: number }[] }

    // ── Wall commands ──────────────────────────────────────────

    /**
     * Tạo tường mới nối hai node đã tồn tại.
     * Geometry được WallGeometrySystem tự tính từ node positions.
     */
    | { type: "ADD_WALL"; wallId: string; startNodeId: string; endNodeId: string; thickness: number }

    /** Xóa tường. Nodes không còn được dùng sẽ bị xóa tự động. */
    | { type: "REMOVE_WALL"; wallId: string }

    /**
     * Gộp sourceNodeId vào targetNodeId.
     * Tất cả walls kết nối với sourceNodeId sẽ được reroute sang targetNodeId.
     * sourceNodeId bị xóa sau khi gộp.
     * Dùng khi kéo node chồng lên node khác (snap-to-connect).
     */
    | { type: "MERGE_NODE"; sourceNodeId: string; targetNodeId: string }

    /**
     * Cắt một bức tường làm đôi tại một vị trí cụ thể (x, z).
     * Sẽ tạo ra một node mới và một tường mới. Tường cũ sẽ được cập nhật endNodeId thành newNodeId.
     */
    | { type: "SPLIT_WALL"; originalWallId: string; newWallId: string; newNodeId: string; x: number; z: number }

    /**
     * Tự động quét và xử lý các giao cắt của một bức tường mới/di chuyển với tất cả tường cũ.
     */
    | { type: "RESOLVE_INTERSECTIONS"; wallId: string }

    /**
     * Cập nhật thông số kích thước của một bức tường (thickness và/hoặc height).
     * Giá trị tính bằng world units. WallGeometrySystem sẽ rebuild mesh trên frame kế tiếp.
     */
    | { type: "UPDATE_WALL"; wallId: string; thickness?: number; height?: number }

    /**
     * Đặt một furniture entity vĩnh viễn vào scene tại vị trí (x, z).
     * Dispatched bởi FurniturePlacementSystem khi user left-click để confirm.
     */
    | { type: "PLACE_FURNITURE"; modelId: string; x: number; z: number; rotY: number; y?: number; materials?: Record<string, string> }

    /**
     * Đặt một item bám tường (kệ treo, cửa, cửa sổ) vào tường `hostWallId`.
     * `t` = vị trí dọc tim tường (0..1), `side` = mặt tường (+1/−1).
     * Handler đọc catalog.placement để biết kiểu bám (mount/opening), tính
     * Transform từ topology tường, gắn WallMounted hoặc WallOpening.
     */
    | { type: "PLACE_WALL_ITEM"; modelId: string; hostWallId: string; t: number; side: number; materials?: Record<string, string> }

    /**
     * Di chuyển / lật một item bám tường (cửa, cửa sổ, kệ) ĐÃ đặt.
     * `hostWallId` có thể KHÁC tường cũ (kéo cửa nhảy sang tường khác).
     * `t` = vị trí dọc tim tường (0..1), `side` = mặt tường (+1/−1, lật 180°).
     * Handler clamp `t` khỏi 2 đầu tường và từ chối nếu chồng opening khác
     * (giữ nguyên vị trí cũ + markDirty để 2D snap lại). WallMountSystem suy lại
     * Transform, WallOpeningSystem khoét lại tường ở frame kế.
     */
    | { type: "MOVE_WALL_ITEM"; entityId: string; hostWallId: string; t: number; side: number }

    /**
     * Di chuyển furniture entity đến vị trí mới (x, z) trong 2D floor plan.
     * Dispatcher kiểm tra va chạm — nếu bị chặn, entity giữ nguyên vị trí cũ.
     * force=true: BỎ QUA snap + collision, đặt thẳng vị trí — dùng cho group-move/rotate
     * (cả cụm dời/xoay theo delta cứng, giữ layout tương đối, cho chồng tạm; xem MULTISELECT-PLAN).
     */
    | { type: "MOVE_FURNITURE"; entityId: string; x: number; z: number; force?: boolean }

    /**
     * Xoay furniture entity đến góc rotY mới (radians, quanh trục Y).
     * Dispatcher kiểm tra va chạm — nếu bị chặn, entity giữ nguyên góc cũ.
     * force=true: BỎ QUA collision, đặt thẳng góc — dùng cho group-rotate (va chạm nới lỏng).
     */
    | { type: "ROTATE_FURNITURE"; entityId: string; rotY: number; force?: boolean }

    /**
     * Xóa vĩnh viễn furniture entity khỏi scene.
     * Giải phóng GLB root (ModelRegistry) và mesh legacy (MeshRegistry nếu có).
     */
    | { type: "DELETE_FURNITURE"; entityId: string }

    /**
     * Áp một material PBR (materialId trong materials.json) lên một slot
     * (component) của furniture/wall-item. Handler khớp sub-mesh theo
     * materialBindings rồi gán lại mesh.material — đổi tức thì ở khung 3D.
     */
    | { type: "APPLY_FURNITURE_MATERIAL"; entityId: string; slotId: string; materialId: string }

    /**
     * Đặt material PBR cho MỘT MẶT của tường (left/right, theo wallId). Handler load
     * material qua MaterialLibrary, clone + tiling, gán lên group mặt đó của mesh tường
     * và lưu vào SurfaceMaterial.faces[face] (giữ qua rebuild geometry + serialize).
     */
    | { type: "SET_WALL_MATERIAL"; wallId: string; materialId: string; face: WallFace }

    /**
     * Đặt material PBR cho sàn một phòng (theo roomKey = sorted nodeIds — bền qua
     * rebuild topology). Lưu vào registry roomKey→materialId; RoomSystem re-apply
     * khi dựng lại floor mesh.
     */
    | { type: "SET_FLOOR_MATERIAL"; roomKey: string; materialId: string }

    /**
     * Khôi phục material mặc định (GLB gốc) cho một slot của furniture/wall-item.
     * Gán lại sub-mesh.material từ Model3D.originalMaterials + xoá override khỏi
     * materialOverrides (không serialize nữa). No-op nếu chưa từng đổi material.
     */
    | { type: "RESET_FURNITURE_MATERIAL"; entityId: string; slotId: string }

    /**
     * Khôi phục material mặc định cho MỘT MẶT của tường: xoá faces[face]; nếu cả 2 mặt
     * trống → gỡ SurfaceMaterial component + trả mesh về material default đơn.
     */
    | { type: "RESET_WALL_MATERIAL"; wallId: string; face: WallFace }

    /**
     * Khôi phục material mặc định của sàn một phòng: xoá khỏi registry floorMaterials
     * + gán lại mesh sàn về material mặc định (FLOOR_DEFAULT_MATERIAL).
     */
    | { type: "RESET_FLOOR_MATERIAL"; roomKey: string }

    /**
     * Gán LOẠI phòng (living/bedroom/kitchen/…) cho một phòng theo roomKey
     * (sorted nodeIds — bền qua rebuild topology). Thuần metadata, không có mesh:
     * ghi vào registry roomKey→roomType để describeScene phơi ra cho AI/UI biết
     * phòng nào là gì sau khi generate. `roomType` để dạng string mở (engine không
     * ràng buộc vocab — tầng AI gán nghĩa). Lưu/khôi phục như floorMaterials.
     */
    | { type: "SET_ROOM_TYPE"; roomKey: string; roomType: string }
    ;

