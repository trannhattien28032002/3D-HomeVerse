/**
 * =============================================================================
 * wallHelpers.ts — Bộ hàm tiện ích đồng bộ hóa derived state của tường
 * =============================================================================
 *
 * MỤC ĐÍCH TỔNG THỂ
 * -----------------
 * Module này cung cấp các helper function để **tính lại** (recompute) các
 * component ECS phụ thuộc vào vị trí node — cụ thể là Transform, WallSize,
 * và ColliderAABB — từ dữ liệu gốc lưu trong NodeRegistry.
 *
 * NGUỒN CHÂN LÝ (SOURCE OF TRUTH) TRONG KIẾN TRÚC NÀY
 * -----------------------------------------------------
 * Trong HomeVerse engine, hình học của một tường KHÔNG được lưu trực tiếp
 * vào Transform hay WallSize. Thay vào đó:
 *
 *   Canonical state  →  NodeRegistry (hai điểm đầu/cuối: startNodeId, endNodeId)
 *   Derived state    →  Transform, WallSize, ColliderAABB (tính từ hai điểm đó)
 *
 * Ưu điểm của thiết kế này:
 *   - Topology graph (node/wall connections) là single source of truth.
 *   - Khi node di chuyển, chỉ cần cập nhật NodeRegistry → recompute derived state.
 *   - Nhiều tường chia sẻ cùng node (junction) → node chỉ cần lưu một lần.
 *   - Dễ serialize/deserialize: chỉ cần lưu node positions + wall connectivity.
 *
 * CÁC COMPONENT ĐƯỢC CẬP NHẬT
 * ----------------------------
 *   Transform    — Vị trí trung tâm (cx, cz) và góc xoay (rotY) của wall entity
 *                  trong không gian 3D. Dùng để đặt THREE.Object3D transform.
 *
 *   WallSize     — Chiều dài tường (length). WallGeometrySystem dùng giá trị này
 *                  để extrude geometry (kéo dài mesh theo trục tường).
 *
 *   ColliderAABB — Bounding box dùng cho picking (click chọn tường trong 2D view)
 *                  và frustum culling thô. Lưu half-extent theo trục tường.
 *
 * AI GỌI MODULE NÀY?
 * ------------------
 * dispatcher.ts gọi recomputeWallAABB() trong nhiều lệnh:
 *   - MOVE_NODE          → node di chuyển → tất cả tường liên quan cần recompute
 *   - MERGE_NODE         → sau khi reroute wall sang targetNode
 *   - SPLIT_WALL         → tường gốc và newNode cần đồng bộ lại transform
 *
 * Không phải System chạy hàm này — đây là thao tác đồng bộ **tức thì** trong
 * dispatcher (khác với WallPolygon rebuild được defer về WallGeometrySystem).
 *
 * TẠI SAO AABB ĐƯỢC CẬP NHẬT NGAY (KHÔNG DEFER)?
 * ------------------------------------------------
 * AABB được dùng ngay trong frame hiện tại cho:
 *   - Raycast picking trên 2D canvas (người dùng click chọn tường)
 *   - Frustum culling để quyết định có render tường hay không
 * Nếu defer, user click ngay sau khi move sẽ hit sai tường.
 * Ngược lại, WallPolygon (mesh 3D) được defer vì mesh update là operation đắt
 * hơn và không cần thiết trong cùng frame với interaction.
 */
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { Transform } from "src/engine/components/core/Transform";
import { WallSize } from "src/engine/components/wall/WallSize";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";

// =============================================================================
// recomputeWallAABB — Tính lại Transform, WallSize, ColliderAABB cho một tường
// =============================================================================
//
// Hàm này là "projection" từ NodeRegistry (canonical) sang ECS components (derived):
//
//   NodeRegistry [startNode(x,z), endNode(x,z)]
//       │
//       ▼  recomputeWallAABB()
//       │
//       ├─→ Transform  { x: cx, z: cz, rotY }   — vị trí và góc của wall entity
//       ├─→ WallSize   { length }                — chiều dài tường (scalar)
//       └─→ ColliderAABB { width: len/2 }        — half-extent cho picking/culling
//
// THAM SỐ
// -------
//   world   — ECS world để đọc/ghi component
//   entity  — ECS entity ID của tường cần recompute
//   nodes   — NodeRegistry để đọc tọa độ startNode và endNode
//
// GUARD PATTERN
// -------------
// Hàm có ba điểm return sớm:
//   1. WallNodes không tồn tại → entity không phải tường (không crash)
//   2. startNode hoặc endNode không tồn tại trong registry → topology inconsistency
//   3. Component nào đó null → skip update cho component đó (không crash)
// Điều này cho phép caller không cần check trước khi gọi — hàm tự "safe".
//
// TODO: Log warning khi case 2 xảy ra (startNode/endNode missing) vì đó là
//       dấu hiệu topology bị corrupt — hiện tại silent failure rất khó debug.
export function recomputeWallAABB(world: World, entity: string, nodes: NodeRegistry): void {
    // ─── Bước 1: Đọc WallNodes để biết hai node đầu/cuối ────────────────────
    // WallNodes là component lưu startNodeId và endNodeId (string IDs trong NodeRegistry).
    // Không lưu tọa độ trực tiếp — tọa độ thực tế lấy từ NodeRegistry ở bước 2.
    const wn = world.getComponent(entity, WallNodes);
    if (!wn) return; // Entity này không phải wall entity — bỏ qua

    // ─── Bước 2: Lấy tọa độ thực tế từ NodeRegistry ─────────────────────────
    // NodeRegistry là source of truth cho vị trí node trong không gian XZ.
    const sn = nodes.get(wn.startNodeId);
    const en = nodes.get(wn.endNodeId);
    if (!sn || !en) return; // Topology inconsistency — node bị xóa mà wall chưa được cleanup

    // ─── Bước 3: Tính các giá trị hình học từ hai điểm đầu/cuối ─────────────
    //
    // Tất cả tính toán trong mặt phẳng XZ (Y là trục đứng = chiều cao).
    // Đây là mặt phẳng floor plan — tường nhìn từ trên xuống.

    // dx, dz: vector hướng từ startNode đến endNode trong mặt phẳng XZ.
    const dx = en.x - sn.x, dz = en.z - sn.z;

    // Chiều dài Euclidean của tường.
    const len = Math.hypot(dx, dz);

    // ─── GIẢI THÍCH TOÁN HỌC: rotY = -Math.atan2(dz, dx) ───────────────────
    //
    // Mục tiêu: tính góc xoay quanh trục Y để wall mesh (ban đầu nằm dọc
    //           theo trục +X) rotate về đúng hướng của tường.
    //
    // Math.atan2(dz, dx):
    //   Trả về góc (radian) từ trục +X đến vector (dx, dz), đo ngược chiều
    //   kim đồng hồ trong hệ tọa độ toán học (X phải, Z lên).
    //   Ví dụ:
    //     dx=1, dz=0  → atan2(0, 1)  = 0       (tường nằm ngang theo +X)
    //     dx=0, dz=1  → atan2(1, 0)  = π/2     (tường theo +Z)
    //     dx=-1, dz=0 → atan2(0, -1) = π        (tường ngược chiều -X)
    //
    // Tại sao có dấu âm (-)?
    //   Trong THREE.js, hệ tọa độ là right-hand với Y lên:
    //     - Nhìn từ trên xuống (trục +Y hướng về mắt), trục +X sang phải,
    //       trục +Z hướng ra phía trước (về phía viewer).
    //     - Rotation dương quanh Y = counterclockwise từ +X về -Z.
    //     - Rotation âm quanh Y  = clockwise từ +X về +Z.
    //
    //   Vì vậy để xoay từ +X sang +Z (hướng dương Z) cần rotY âm:
    //     tường theo +Z: atan2(1, 0) = +π/2 → rotY = -π/2 ✓
    //
    //   Kiểm tra các trường hợp:
    //     dx=1, dz=0  → rotY = 0     → mesh giữ nguyên theo +X        ✓
    //     dx=0, dz=1  → rotY = -π/2  → mesh xoay clockwise 90° → +Z   ✓
    //     dx=-1,dz=0  → rotY = -π    → mesh lật 180°                  ✓
    //     dx=0, dz=-1 → rotY = +π/2  → mesh xoay CCW 90° → -Z         ✓
    //
    // WARNING: Công thức này giả định wall mesh trong createWall() được tạo
    //   với trục dài nằm dọc theo +X, tâm ở gốc tọa độ. Nếu WallFactory
    //   thay đổi default orientation, công thức này phải được cập nhật theo.
    const rotY = -Math.atan2(dz, dx);

    // Tọa độ trung tâm của tường (midpoint giữa hai node đầu/cuối).
    // Đây là vị trí đặt origin của wall entity trong không gian 3D.
    const cx = (sn.x + en.x) / 2;
    const cz = (sn.z + en.z) / 2;

    // ─── Bước 4: Đọc các component cần cập nhật ──────────────────────────────
    // Mỗi component được đọc riêng — component có thể null nếu entity chưa được
    // cấp phát component đó (ví dụ: tường mới tạo chưa có ColliderAABB).
    // Graceful null check: nếu thiếu component thì skip, không crash.
    const t = world.getComponent(entity, Transform);
    const s = world.getComponent(entity, WallSize);
    const c = world.getComponent(entity, ColliderAABB);

    // ─── Bước 5: Ghi các giá trị đã tính vào component ──────────────────────

    // Transform: cập nhật vị trí trung tâm và góc xoay.
    // Lưu ý: t.y (chiều cao) không bị thay đổi ở đây — chiều cao tường
    // được set trong createWall() (cy = 1.6) và chỉ thay đổi qua UPDATE_WALL.
    if (t) { t.x = cx; t.z = cz; t.rotY = rotY; }

    // WallSize: cập nhật chiều dài.
    // WallGeometrySystem dùng s.length để scale/rebuild mesh theo trục dài của tường.
    if (s) { s.length = len; }

    // ColliderAABB: cập nhật half-extent chiều rộng (theo trục dài của tường).
    //
    // WARNING: `c.width` ở đây thực chất là HALF-EXTENT (len / 2), không phải
    //   full width. Đây là convention phổ biến trong physics engine (AABB lưu
    //   half-extents để dễ tính toán intersection: |center_a - center_b| < ha + hb).
    //   Tên field `width` gây nhầm lẫn — nên đổi thành `halfLength` hoặc `halfExtent`.
    //   TODO: Đổi tên ColliderAABB.width → ColliderAABB.halfLength để tránh nhầm lẫn.
    //
    // ColliderAABB theo trục tường (local space):
    //   - Trục dài (theo hướng tường): half-extent = len / 2
    //   - Trục ngắn (vuông góc, = thickness): cần cập nhật riêng nếu thickness thay đổi
    //
    // TODO: Khi UPDATE_WALL thay đổi thickness, ColliderAABB theo trục ngắn cũng
    //   cần được cập nhật. Hiện tại chỉ cập nhật trục dài (width).
    if (c) { c.width = len / 2; }
}
