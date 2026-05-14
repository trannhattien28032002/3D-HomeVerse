Phân tích: Zoom-Invariant Dimensions

1. Cách Professional CAD/Floorplanner Apps giải quyết

Có ba trường phái, mỗi loại app chọn khác nhau:

AutoCAD / QGIS — "Annotative objects": Dimension objects tồn tại trong model space nhưng có DIMSCALE annotation flag. Khi xuất ra paper space, engine render annotation ở kích thước cố định bất kể zoom. Đây là giải pháp phức tạp nhất — không apply cho web canvas.

RoomSketcher, Planner5D — HTML overlay: Canvas render walls/geometry ở world scale, labels là DOM <div> được positioned qua coordinate transform world → screen. Labels được sizing bằng CSS px, không phụ thuộc canvas zoom. Kết quả đẹp nhất nhưng phức tạp nhất.

Sweet Home 3D, Floorplanner.com (Java2D/HTML5 Canvas) — Scale compensation: Dùng đúng trick 1/scale cho tất cả annotation elements. Đây là approach phổ biến nhất trong canvas-based tools vì đơn giản và đủ tốt.

Figma, Sketch — Tách rendering context: Geometry canvas (world-scaled) + UI chrome canvas (screen-scaled, overlay). Không khả thi với React Konva một Stage.

Kết luận thực tế cho codebase này: Sweet Home 3D approach — 1/scale compensation applied consistently. Room labels đã dùng đúng pattern này. Cần apply cho toàn bộ dimension system.

---
2. World-Space vs Screen-Space — Kiến trúc

Đây là distiction quan trọng nhất, và codebase hiện tại trộn lẫn chúng không nhất quán:

Hiện tại (broken):
┌─────────────────────────────────────────────┐
│ Stage (scaleX = stageScale)                │
│  ├── Wall geometry      → World-space ✓    │
│  ├── Wall fills         → World-space ✓    │
│  ├── Dimension lines    → World-space ✓    │  ← đúng
│  ├── Dimension LABELS   → World-space ✗    │  ← sai: nên screen-space
│  ├── Extension lines    → World-space ?    │  ← tùy
│  ├── Dot markers        → World-space ✗    │  ← nên screen-space
│  └── Angle arc RADIUS   → World-space ✗    │  ← nên screen-space
└─────────────────────────────────────────────┘

Mục tiêu (fixed):
World-space  (scale với zoom): Wall geometry, dimension line position, arc position
Screen-space (1/scale):        Font size, stroke width, dot radius, arc radius, label bg, arrow heads

Quy tắc phân loại:

┌─────────────────────────┬────────┬──────────────────────────┐
│         Element         │ Space  │          Lý do           │
├─────────────────────────┼────────┼──────────────────────────┤
│ Wall polygon            │ World  │ Là geometry              │
├─────────────────────────┼────────┼──────────────────────────┤
│ Dimension line (vị trí) │ World  │ Luôn 300mm từ tường      │
├─────────────────────────┼────────┼──────────────────────────┤
│ Dimension line (độ dày) │ Screen │ Decorative, không scale  │
├─────────────────────────┼────────┼──────────────────────────┤
│ Extension line (vị trí) │ World  │ Tính từ wall endpoint    │
├─────────────────────────┼────────┼──────────────────────────┤
│ Extension line (độ dày) │ Screen │ Decorative               │
├─────────────────────────┼────────┼──────────────────────────┤
│ Font size               │ Screen │ Readability              │
├─────────────────────────┼────────┼──────────────────────────┤
│ Label background        │ Screen │ Readability              │
├─────────────────────────┼────────┼──────────────────────────┤
│ Dot markers             │ Screen │ Decorative               │
├─────────────────────────┼────────┼──────────────────────────┤
│ Angle arc radius        │ Screen │ Indicator, không measure │
├─────────────────────────┼────────┼──────────────────────────┤
│ Angle arc stroke        │ Screen │ Decorative               │
├─────────────────────────┼────────┼──────────────────────────┤
│ Snap handles            │ Screen │ Hit target phải usable   │
└─────────────────────────┴────────┴──────────────────────────┘

---
3. Rendering Strategy trong Konva — Ba lựa chọn và Tradeoffs

Option A: Scale Compensation (khuyến nghị)

Giữ nguyên Stage structure, apply 1/stageScale cho mọi screen-space element.

Pros: Đơn giản, consistent với room labels đã làm, không thay đổi architecture
Cons: Extreme zoom (0.1×) làm labels to bất thường nếu không clamp

Option B: HTML Overlay

Labels là <div> absolute-positioned trên canvas. Tính vị trí qua:
screenX = worldX * stageScale + stagePos.x
screenY = worldY * stageScale + stagePos.y

Pros: Text rendering tốt nhất (antialiasing, subpixel), CSS styling
Cons: Cần sync position mỗi frame khi pan/zoom, z-ordering phức tạp,
      labels không clip theo viewport Konva, 2 rendering systems song song

Option C: Fixed-Scale Konva Layer
Cons: Position transform phức tạp, layer không pan theo Stage,
      không hoạt động đúng với stage offset

Khuyến nghị: Option A — với clamping (xem mục 5). Codebase đã đi đúng hướng này với room labels.

---
4. Scaling Formulas

dotRadius       = DOT_PX / s           // e.g., 2.5 / s
arcRadius       = ARC_PX / s           // e.g., 28 / s  ← angle arc
labelBgWidth    = charCount * CHAR_W / s + PAD * 2 / s
arrowHeadLen    = ARROW_PX / s         // e.g., 8 / s
extensionGap    = GAP_PX / s           // e.g., 5 / s
extensionOver   = OVER_PX / s          // e.g., 5 / s

// World-space elements: scale naturally with
Trường hợp đặc biệt — Dimension line offset:

DIM_OFFSET hiện tại = 30px (canvas) = 300mm world. Đây là world-space — đúng. Khi zoom in, dimension line cách tường xa hơn về pixel nhưng vẫn là 300mm thực. Không compensate cái này.

Chỉ compensate label gap (khoảng hở giữa dimension line và label text) vì đó là UI padding, không phải measurement.

---
5. Zoom Compensation Techniques — Clamping là Quan Trọng Nhất

const effectiveScale = Math.max(LABEL_MIN_SCALE, stageScale);
fontSize = 11 / effectiveScale

// LABEL_MIN_SCALE = 0.4 → tại zoom 0.1, label vẫn chỉ 11/0.4 = 27.5px, không phải 110px

Kết hợp với LOD hiding (xem mục 6):
// Zoom quá nhỏ → ẩn labels thay vì render chúng to
const SHOW_LABELS_BELOW = 0.25  // ẩn dưới 25%
const LABEL_SCALE_MIN = 0.35  // effective scale floor cho font compensation
const DIM_HIDE_BELOW  = 0.25  // ẩn toàn bộ dimensions dưới mức này
const ANGLE_HIDE_BELOW = 0.4  // ẩn angle arcs sớm hơn (nhỏ hơn, dễ rối)

Effective scale helper (dùng ở mọi nơi cần compensation):
// Định nghĩa một lần, dùng trong toàn bộ dimension layer
const eff = Math.max(LABEL_SCALE_MIN, stageScale);
const fs  = 11 / eff;   // font size
const sw  = 1  / eff;   // stroke width
// ...

---
6. Dimension LOD Strategies

LOD (Level of Detail) là cách CAD apps ẩn/hiện information theo zoom. Thay vì scale mọi thứ mãi, ẩn bớt khi quá nhỏ.

LOD cho codebase này:

zoom < 0.25 : Ẩn TẤT CẢ dimensions (tường quá nhỏ, không cần label)
zoom < 0.40 : Ẩn angle arcs (chúng nhỏ, rối, không readable)
zoom ≥ 0.40 : Ẩn dimensions cho walls ngắn hơn 0.5m (label sẽ overlap)
zoom ≥ 0.25 : Hiện length dimensions với full label

Label format LOD:
zoom < 0.5 : "3.5m"     (compact)
zoom ≥ 0.5 : "3500 mm"  (standard) hoặc "3.50 m" (tùy setting)

Thực tế đơn giản hơn — chỉ cần 2 level:
- Visible: stageScale ≥ threshold → show đầy đủ với compensation
- Hidden: stageScale < threshold → return null cho toàn bộ element group

Tránh "abbreviated label" approach vì nó làm code phức tạp mà lợi ích không nhiều. Hiding sạch hơn.

---
7. Performance Considerations

1/scale computation: O(1) per element, zero overhead. Đây chỉ là tính toán constant trong render function.

Layer re-draw trigger: Mỗi khi stageScale thay đổi (wheel event), Konva redraw tất cả layers. Dimension layer hiện có listening={false} — đúng rồi, quan trọng để Konva skip hit-testing.

Vấn đề tiềm ẩn với clamping + LOD: useMemo tro
{stageScale >= DIM_HIDE_BELOW && dimensions.filter(...).map(...)}

// Sai chỗ: trong useFloorPlanStore
// Không put zoom-dependent filtering vào store

stageScaleRef vs stageScale: Hiện tại wheel events dùng stageScaleRef.current để tránh stale closure. Dimension render dùng stageScale state — đúng, vì render chỉ trigger khi state update.


Không cần thay đổi architecture. Chỉ cần:

1. Define constants một lần: LABEL_SCALE_MIN = 0.35, DIM_HIDE_BELOW = 0.25, ANGLE_HIDE_BELOW = 0.40
2. Trong dimension layer: Dùng eff = Math.max(LABEL_SCALE_MIN, stageScale) → apply / eff cho tất cả screen-space elements
3. LOD guards: Wrap dimension render trong stageScale >= DIM_HIDE_BELOW &&
4. Giữ nguyên DIM_OFFSET (world-space, đúng), wall polygon (world-space, đúng)
5. Cũng fix snap handles (node drag radius) — cùng pattern, khác layer