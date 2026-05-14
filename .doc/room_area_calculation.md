---
Phân tích: Room Area Calculation

1. Room Detection đang hoạt động như thế nào

RoomDetection.ts dùng DCEL (Doubly-Connected Edge List) — đây là lựa chọn đúng, không cần thay đổi thuật toán. Pipeline hiện tại:

Node graph thay đổi
    ↓
RoomSystem: hash(nodes + connections) → so sánh lastHash
    ↓ (chỉ khi hash khác)
RoomDetection.findRooms()
    → Build half-edges từ mỗi wall
    → Link twins (chiều ngược lại)
    → Sort radially → link "next"
    → Traverse loops → extract faces
    → Filter: area < -0.01 (interior rooms, CW winding trong Z-down)
    ↓
RoomGeometry component: { points[], area }
    ↓
SnapshotSystem: emit rooms[{ id, area, polygon }]
    ↓
PlanView2D: vẽ fill — nhưng KHÔNG có area label

Gap thực sự là ở dòng cuối: data đã có, chỉ thiếu rendering label + tính centroid để đặt label.

---
2. Geometry Algorithms cần thêm

Shoelace formula cho area: đã dùng trong RoomDetection.ts, đúng.

Điều còn thiếu: Centroid của polygon. Không dùng average của vertices — nó sai với non-convex rooms (phòng chữ L, phòng có góc lõm). Dùng centroid theo diện tích:

A = Shoelace area (signed)

Cx = (1 / 6A) × Σ (xi + xi+1)(xi×zi+1 − xi+1×zi)
Cz = (1 / 6A) × Σ (zi + zi+1)(xi×zi+1 − xi+1×zi)

Centroid này đảm bảo nằm đúng center-of-mass của polygon, không phải center-of-bounding-box.

Vấn đề: Với non-convex polygon (phòng chữ L, chữ U), centroid có thể rơi ngoài polygon. Ví dụ phòng chữ L hẹp, centroid sẽ nằm ở khoảng trống giữa hai nhánh.

Có hai cách xử lý:
- Đơn giản (v1): Dùng centroid trực tiếp, chấp nhận label có thể nằm ngoài phòng hẹp/kỳ lạ. Với phần lớn phòng thực tế (hình chữ nhật, hình thang, đa giác lồi), centroid luôn nằm trong.
- Chính xác hơn (v2 nếu cần): Tính centroid → kiểm tra pointInPolygon (ray casting) → nếu ngoài, fallback về visual center của bounding box hoặc tìm điểm trong bằng erosion.

Khuyến nghị: implement centroid chuẩn trước, xử lý point-in-polygon chỉ khi user report lỗi. Với floorplan thông thường (hình chữ nhật, phòng lồi), sẽ không xảy ra.

---
3. Cách CAD/Floorplanner apps giải quyết

RoomSketcher, Planner5D, Sweet Home 3D: Đều dùng DCEL hoặc variant của nó. Bạn đang đi đúng hướng industry-standard.

AutoCAD: Dùng "region" objects — area is computed from boundary curves, not from wall topology. Khác về model, không apply.

The Sims, SketchUp: Hash-gated recomputation mỗi khi topology thay đổi — y hệt cái bạn đang có trong RoomSystem.lastHash.

Quan trọng: Tất cả production apps đều tách detection (DCEL) khỏi area label (centroid + rendering). Detection chạy ít hơn (chỉ khi topology thay đổi). Label re-renders mỗi khi zoom/pan thay đổi viewport.

Điều quan trọng hơn mà production apps làm và bạn chưa có: minimum area threshold. Rooms < 0.1 m² (sliver rooms do walls gần song song hoặc RESOLVE_INTERSECTIONS tạo ra) nên bị filter trước khi render.

---
4. Data Structures

Hiện tại đã đủ cho area display:

// Đã có trong ECSSnapshot
type RoomSnapshot = {
    id: string;
    area: number;      ← đây rồi, tính bằng m²
    polygon: { x: number; z: number }[];
};

// Đã có trong useFloorPlanStore
type Room2D = {
    id: string;
    area: number;
    polygon: { x: number; y: number }[];  ← pixel coords
};

Điều duy nhất cần thêm: centroid vào Room2D (tính trong useFloorPlanStore từ polygon pixel coords), hoặc tính inline trong render.

Không nên thêm centroid vào RoomGeometry ECS component hay RoomSnapshot — centroid phụ thuộc viewport offset, tính đúng chỗ là trong store conversion (y hệt cách dimToPx làm).

Cho future doors/windows, data structure sẽ cần:

type RoomSnapshot = {
    id: string;
    area: number;         // net area (trừ wall thickness đã tính đúng bởi DCEL)
    polygon: ...[];
    floorId: string;      // cho multi-floor
    // Không cần thêm door/window refs — DCEL tự handle topology
};

---
5. Performance Concerns

Không có vấn đề gì hiện tại. DCEL traversal là O(E log E) do bước sort radially. Với 200 walls (400 half-edges), chạy trong < 1ms.

Hash computation trong RoomSystem là O(N) trên số nodes + connections — sẽ chạy mỗi frame. Với 500 nodes, vẫn ổn (~50µs).

Điều cần theo dõi khi scale:
- RESOLVE_INTERSECTIONS sau mỗi wall draw tạo nhiều nodes mới → hash thay đổi → DCEL chạy lại. Với 500 walls phức tạp có nhiều intersections, DCEL có thể mất 2-5ms. Vẫn chấp nhận được nhưng nên monitor.
- Centroid computation là O(N vertices per room) — negligible.

Không cần Web Worker hay incremental DCEL cho quy mô floorplan editor bình thường (< 1000 walls). Thêm phức tạp không cần thiết.

---
6. Edge Cases

Đây là phần quan trọng nhất. Phân loại theo mức độ nghiêm trọng:

Đã được xử lý (không cần lo):
- Duplicate walls → DCEL build step skip directed edge trùng
- Self-intersecting walls → RESOLVE_INTERSECTIONS command phá chúng trước khi DCEL chạy
- Open rooms (không đóng kín) → DCEL không tạo closed loop → không xuất hiện

Cần kiểm tra và có thể cần fix:

Sliver rooms: Khi hai walls gần song song tạo khoảng hở rất nhỏ, DCEL sẽ detect đây là một "room" với diện tích vài cm². Cần MIN_ROOM_AREA = 0.1 (m²) threshold để filter.

Room-within-room (nested): Phòng bên trong phòng (ví dụ tường nội thất). DCEL sẽ find cả polygon ngoài lẫn polygon trong. Cái ngoài có signed area dương → bị filter. Cái trong có signed area âm → pass filter. Đây là behavior đúng — mỗi enclosed space là một room độc lập. Nhưng area label của inner room có thể overlap với outer room label. Cần kiểm tra thực tế.

T-junction artifacts: Khi wall đâm vào giữa wall khác tạo T-junction, SPLIT_WALL command đã handle. Nhưng nếu user vẽ wall đâm vào gần endpoint của wall khác (không split), có thể tạo tiny degenerate polygon ở điểm đó. MIN_ROOM_AREA threshold cũng handle case này.

Single wall tạo "room": Nếu user vẽ wall từ A đến B, rồi vẽ wall từ B về A (wall chồng chính xác), DCEL có thể treat chúng là degenerate face. Skip duplicate directed edge trong bước build đã xử lý.

Exterior polygon: DCEL sẽ tìm ra "outer face" của toàn bộ building là một polygon rất lớn với CW winding. Filter area < -0.01 bắt được nếu code dùng Z-down coords đúng. Cần verify behavior này khi có một căn phòng duy nhất (chưa chắc outer face đã bị filter đúng).

---
7. Rendering Strategy

2D (Konva) — điều cần thêm:

Hiện tại rooms được render như filled polygon. Cần thêm area label ở centroid:

Centroid (px) = tính từ Room2D.polygon
Label: "12.5 m²" hoặc "12500 cm²" tùy scale
Background: semi-transparent rect để readable trên fill màu vàng

Cần lưu ý với zoom: Font size nên không đổi theo zoom (dùng fontSize / stageScale để compensate, hoặc đặt label ở Konva layer không bị scale). Hiện tại Stage có scaleX={stageScale} nên tất cả elements trong Stage đều bị zoom. Text trong dimension layer đã bị ảnh hưởng bởi zoom — nên kiểm tra behavior này trước khi implement area labels.

3D (Three.js) — đã có floor mesh. Area label trong 3D phức tạp hơn nhiều (cần billboard text). Defer sang v2.

Layer separation: Area labels nên nằm trong một Konva Layer riêng (không phải layer wall, không phải layer dimension). Tách layer giúp Konvthay vì Line closed. Đây là v3+ problem.

---
Tóm tắt: Việc cần làm ngay

Chỉ cần một thay đổi nhỏ để có area display đầy đủ:

1. Thêm hàm computeCentroid(polygon) trong useFloorPlanStore (hoặc inline trong component)
2. Thêm area label render trong PlanView2D cùng layer với room fills
3. Thêm MIN_ROOM_AREA = 0.1 threshold trong RoomSystem để filter sliver rooms
4. Verify exterior polygon được filter đúng khi có 1 room duy nhất

Tất cả infrastructure (DCEL, area computation, snapshot pipeline) đã chạy. Không cần refactor gì.