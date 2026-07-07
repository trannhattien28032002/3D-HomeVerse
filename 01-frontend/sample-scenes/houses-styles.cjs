/**
 * houses-styles.js — 10 mẫu nhà bổ sung, mỗi file một phong cách thiết kế nội thất.
 *
 * Dùng CHUNG builder/validator với generate.cjs (require ở cuối generate.cjs).
 * Quy ước toạ độ giống houses.cjs:
 *   - Mặt phẳng X-Z (mét), Z tăng = đi "xuống" trên mặt bằng.
 *   - rooms[].rect = [x1, z1, x2, z2]  (góc trên-trái → dưới-phải)
 *   - furniture deg = góc xoay quanh trục đứng theo ĐỘ (generator đổi sang radian)
 *   - openings/mounted: a,b là 2 đầu của 1 cạnh tường (generator tự dò hostWallId)
 *
 * Phong cách thể hiện qua: vật liệu sàn (floor) + 2 mặt tường (wallFaces) + bảng
 * vật liệu phủ lên nội thất (materials) + lựa chọn/ bố trí đồ. Mọi modelId/
 * materialId đều có thật trong objects.json / materials.json.
 *
 * Shell 16×9 (5 phòng) được tái sử dụng cho vài phong cách — cùng "phần thô" của
 * nhà thầu, khác "gói nội thất" — đúng cách một studio design triển khai concept.
 */

// ── Bố cục dùng lại: nhà 1 tầng 16×9, 5 phòng ──────────────────────────────────
//   Living [0,0,6,9] · Kitchen [6,0,11,5] · Dining [11,0,16,5]
//   Bedroom [6,5,11,9] · Bath [11,5,16,9]
const SHELL_16x9 = () => [
    { name: "Living",  rect: [0, 0, 6, 9] },
    { name: "Kitchen", rect: [6, 0, 11, 5] },
    { name: "Dining",  rect: [11, 0, 16, 5] },
    { name: "Bedroom", rect: [6, 5, 11, 9] },
    { name: "Bath",    rect: [11, 5, 16, 9] },
];

// Bộ cửa/cửa sổ chuẩn cho shell 16×9 (tái dùng, có thể override windows).
const OPENINGS_16x9 = (frontDoor = "door-c") => [
    { model: frontDoor, a: [0, 0], b: [6, 0], t: 0.35 },   // cửa chính → Living
    { model: "door-a", a: [6, 0], b: [6, 5], t: 0.55 },    // Living ↔ Kitchen
    { model: "door-a", a: [6, 5], b: [6, 9], t: 0.5 },     // Living ↔ Bedroom
    { model: "door-c", a: [11, 0], b: [11, 5], t: 0.5 },   // Kitchen ↔ Dining
    { model: "door-a", a: [11, 5], b: [11, 9], t: 0.5 },   // Bedroom ↔ Bath
    { model: "window-c", a: [0, 0], b: [0, 9], t: 0.25 },  // Living trái
    { model: "window-b", a: [0, 9], b: [6, 9], t: 0.5 },   // Living dưới
    { model: "window-a", a: [6, 0], b: [11, 0], t: 0.5 },  // Kitchen trên
    { model: "window-a", a: [16, 0], b: [16, 5], t: 0.5 }, // Dining phải
    { model: "window-b", a: [6, 9], b: [11, 9], t: 0.5 },  // Bedroom dưới
    { model: "window-c", a: [16, 5], b: [16, 9], t: 0.7 }, // Bath phải
];

// helper áp 1 material cho dải tường (left+right) của toàn bộ phòng
const wf = (m) => ({ left: m, right: m });

// ════════════════════════════════════════════════════════════════════════════
// 06) SCANDINAVIAN — gỗ sáng, tường trắng, vải xám nhạt, nhiều cây, sáng & ấm.
// ════════════════════════════════════════════════════════════════════════════
const scandinavian = {
    file: "06-scandinavian.homeverseplan",
    wallH: 2.7, wallT: 0.12,
    rooms: SHELL_16x9().map((r) => ({
        ...r,
        floor: r.name === "Bath" ? "Tiles132A" : r.name === "Kitchen" ? "WoodFloor051" : "WoodFloor051",
        wallFaces: r.name === "Bath" ? wf("Tiles132A") : wf("PaintedPlaster017"),
    })),
    furniture: [
        // Living — sofa vải sáng, thảm len, cây xanh
        { model: "sofa-b", x: 1.6, z: 6.5, deg: 90, materials: { "component-1": "Fabric055", "component-2": "Wood092" } },
        { model: "sofa-b", x: 1.6, z: 4.5, deg: 90, materials: { "component-1": "Fabric055", "component-2": "Wood092" } },
        { model: "carpet-A-01", x: 3.4, z: 5.5, deg: 0, materials: { "component-1": "Fabric054", "component-2": "Fabric018" } },
        { model: "table-c", x: 3.4, z: 5.5, deg: 0, materials: { "component-1": "Wood092", "component-2": "Wood092" } },
        { model: "chair-D-01", x: 4.8, z: 7.4, deg: 200, materials: { "component-1": "Fabric054" } },
        { model: "shelf-c", x: 0.6, z: 1, deg: 90, materials: { "component-1": "Wood092" } },
        { model: "plant-a", x: 5.3, z: 8.4 },
        { model: "plant-a", x: 0.7, z: 8.3 },
        // Kitchen — tủ gỗ sáng dọc tường trên
        { model: "cupboard-sink", x: 7, z: 0.45, deg: 0, materials: { "component-1": "Wood092" } },
        { model: "oven", x: 8.3, z: 0.45, deg: 0 },
        { model: "cupboard-e", x: 9.4, z: 0.45, deg: 0, materials: { "component-1": "Wood092" } },
        { model: "fridge-a", x: 10.4, z: 0.7, deg: 0 },
        { model: "kettle", x: 6.5, z: 0.5, deg: 0, y: 1.18 },
        { model: "table-a", x: 8.5, z: 3.4, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "chair-A-01", x: 7.7, z: 3.4, deg: 90, materials: { "component-1": "Wood092", "component-2": "Fabric054" } },
        { model: "chair-A-01", x: 9.3, z: 3.4, deg: 270, materials: { "component-1": "Wood092", "component-2": "Fabric054" } },
        // Dining
        { model: "rounded-table-b", x: 13.5, z: 2.5, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "chair-A-01", x: 13.5, z: 1.3, deg: 0, materials: { "component-1": "Wood092", "component-2": "Fabric054" } },
        { model: "chair-A-01", x: 13.5, z: 3.7, deg: 180, materials: { "component-1": "Wood092", "component-2": "Fabric054" } },
        { model: "chair-A-01", x: 12.4, z: 2.5, deg: 90, materials: { "component-1": "Wood092", "component-2": "Fabric054" } },
        { model: "vase", x: 13.5, z: 2.5, deg: 0, y: 0.78 },
        // Bedroom — giường gỗ sáng, chăn xám
        { model: "bed-double-01", x: 8.5, z: 7.3, deg: 0, materials: { brown: "Wood092", "white-002": "Fabric054", "blue-001": "Fabric055" } },
        { model: "drawer-b", x: 6.5, z: 5.4, deg: 0, materials: { "component-1": "Wood092" } },
        { model: "drawer-b", x: 10.5, z: 5.4, deg: 0, materials: { "component-1": "Wood092" } },
        { model: "carpet-C-01", x: 8.5, z: 5.6, deg: 90 },
        { model: "plant-a", x: 10.4, z: 8.3 },
        // Bath
        { model: "bath-01", x: 13.5, z: 8.3, deg: 0 },
        { model: "toilet-01", x: 15.3, z: 5.7, deg: 270 },
        { model: "sink-01", x: 11.6, z: 5.7, deg: 90 },
        { model: "shower-door-01", x: 11.7, z: 8.2, deg: 0 },
    ],
    openings: OPENINGS_16x9("door-c"),
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 9], t: 0.62, side: 1 },
        { model: "wall-shelf-a", a: [0, 0], b: [6, 0], t: 0.5, side: 1, materials: { "component-1": "Wood092" } },
        { model: "clock", a: [0, 0], b: [6, 0], t: 0.78, side: 1 },
        { model: "mirror-a", a: [6, 5], b: [6, 9], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 5], b: [11, 9], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [16, 5], b: [16, 9], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 07) JAPANDI — Nhật × Bắc Âu: đồ thấp, gỗ ấm, palette trung tính, tối giản ấm.
// ════════════════════════════════════════════════════════════════════════════
const japandi = {
    file: "07-japandi.homeverseplan",
    wallH: 2.6, wallT: 0.12,
    rooms: [
        { name: "Living",  rect: [0, 0, 7, 6],  floor: "WoodFloor040", wallFaces: wf("PaintedPlaster017") },
        { name: "Kitchen", rect: [7, 0, 12, 6], floor: "Tiles138",     wallFaces: wf("PaintedPlaster017") },
        { name: "Bedroom", rect: [0, 6, 6, 11], floor: "WoodFloor040", wallFaces: wf("PaintedPlaster017") },
        { name: "Study",   rect: [6, 6, 9, 11], floor: "WoodFloor039", wallFaces: wf("PaintedPlaster017") },
        { name: "Bath",    rect: [9, 6, 12, 11], floor: "Tiles132A",   wallFaces: wf("Tiles132A") },
    ],
    furniture: [
        // Living — bàn trà thấp, ghế thấp, thảm trung tính
        { model: "sofa-c", x: 1.2, z: 3, deg: 90, materials: { "component-1": "Fabric083" } },
        { model: "table-d", x: 3.5, z: 3, deg: 0, materials: { "component-1": "Wood067", "component-2": "Wood067" } },
        { model: "carpet-A-01", x: 3.5, z: 3, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric083" } },
        { model: "chair-D-01", x: 3.5, z: 1.1, deg: 0, materials: { "component-1": "Fabric018" } },
        { model: "chair-D-01", x: 3.5, z: 4.9, deg: 180, materials: { "component-1": "Fabric018" } },
        { model: "plant-a", x: 6.3, z: 5.3 },
        { model: "shelf-e", x: 6.4, z: 0.6, deg: 180, materials: { "component-1": "Wood067" } },
        { model: "vase", x: 0.7, z: 5.3, deg: 0 },
        // Kitchen
        { model: "cupboard-d", x: 7.6, z: 0.5, deg: 0, materials: { "component-1": "Wood067" } },
        { model: "cupboard-sink", x: 8.6, z: 0.5, deg: 0, materials: { "component-1": "Wood067" } },
        { model: "oven", x: 9.7, z: 0.5, deg: 0 },
        { model: "fridge-b", x: 11.4, z: 1, deg: 0 },
        { model: "table-a", x: 9.5, z: 4, deg: 0, materials: { "component-1": "Wood067" } },
        { model: "chair-D-01", x: 8.7, z: 4, deg: 90, materials: { "component-1": "Fabric083" } },
        { model: "chair-D-01", x: 10.3, z: 4, deg: 270, materials: { "component-1": "Fabric083" } },
        // Bedroom — nệm thấp, gỗ ấm
        { model: "bed-double-01", x: 3, z: 8.6, deg: 0, materials: { brown: "Wood067", "white-002": "Fabric018", "blue-001": "Fabric083" } },
        { model: "drawer-b", x: 0.7, z: 6.7, deg: 0, materials: { "component-1": "Wood067" } },
        { model: "carpet-C-01", x: 5, z: 7.2, deg: 90 },
        { model: "plant-b", x: 5.3, z: 10.3 },
        // Study
        { model: "desk", x: 7.5, z: 10.2, deg: 0, materials: { "component-1": "Wood067", "component-2": "Wood067" } },
        { model: "chair-D-01", x: 7.5, z: 9, deg: 0, materials: { "component-1": "Fabric083" } },
        { model: "books-a", x: 7.8, z: 10.2, deg: 0, y: 0.92 },
        { model: "shelf-c", x: 6.5, z: 6.5, deg: 90, materials: { "component-1": "Wood067" } },
        // Bath
        { model: "bath-01", x: 10.5, z: 10.2, deg: 0 },
        { model: "sink-01", x: 9.6, z: 6.6, deg: 90 },
        { model: "toilet-01", x: 11.4, z: 6.7, deg: 270 },
    ],
    openings: [
        { model: "door-a", a: [0, 0], b: [7, 0], t: 0.2 },     // cửa chính → Living
        { model: "door-c", a: [7, 0], b: [7, 6], t: 0.45 },    // Living ↔ Kitchen
        { model: "door-a", a: [0, 6], b: [6, 6], t: 0.3 },     // Living ↔ Bedroom
        { model: "door-a", a: [6, 6], b: [9, 6], t: 0.5 },     // Kitchen ↔ Study
        { model: "door-a", a: [9, 6], b: [9, 11], t: 0.5 },    // Study ↔ Bath
        { model: "window-b", a: [0, 0], b: [7, 0], t: 0.62 },  // Living trên
        { model: "window-c", a: [0, 0], b: [0, 6], t: 0.5 },   // Living trái
        { model: "window-c", a: [12, 0], b: [12, 6], t: 0.5 }, // Kitchen phải
        { model: "window-b", a: [0, 11], b: [6, 11], t: 0.5 }, // Bedroom dưới
        { model: "window-c", a: [12, 6], b: [12, 11], t: 0.6 },// Bath phải
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 6], t: 0.5, side: 1 },
        { model: "wall-shelf-b", a: [0, 0], b: [7, 0], t: 0.3, side: 1, materials: { shelf: "Wood067" } },
        { model: "clock", a: [7, 0], b: [7, 6], t: 0.8, side: -1 },
        { model: "mirror-a", a: [9, 6], b: [9, 11], t: 0.35, side: 1 },
        { model: "towel-holder-01", a: [12, 6], b: [12, 11], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 08) MODERN — phẳng, gọn, gỗ + bê tông nhẹ, xám trung tính, sofa lớn + TV wall.
// ════════════════════════════════════════════════════════════════════════════
const modern = {
    file: "08-modern.homeverseplan",
    wallH: 2.9, wallT: 0.14,
    rooms: SHELL_16x9().map((r) => ({
        ...r,
        floor: r.name === "Bath" ? "Tiles138" : r.name === "Kitchen" ? "Tiles138" : "WoodFloor043",
        wallFaces: r.name === "Bath" ? wf("Tiles105") : r.name === "Living" ? { left: "Concrete042A", right: "PaintedPlaster017" } : wf("PaintedPlaster017"),
    })),
    furniture: [
        // Living — sofa module lớn + bàn thấp + thảm
        { model: "sofa-d", x: 3, z: 7.7, deg: 180, materials: { "component-1": "Fabric081A" } },
        { model: "carpet-B-01", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric054" } },
        { model: "table-c", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Wood095", "component-2": "Metal063" } },
        { model: "chair-E-01", x: 0.9, z: 6, deg: 60, materials: { "component-1": "Fabric081A", "component-2": "Metal063" } },
        { model: "plant-a", x: 5.3, z: 8.4 },
        { model: "shelf-b", x: 3, z: 0.6, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "globe", x: 5.2, z: 1, deg: 0 },
        // Kitchen
        { model: "cupboard-sink", x: 7, z: 0.45, deg: 0, materials: { "component-1": "Plastic014A" } },
        { model: "oven", x: 8.3, z: 0.45, deg: 0 },
        { model: "dishwasher", x: 9.4, z: 0.45, deg: 0 },
        { model: "fridge-b", x: 10.4, z: 0.8, deg: 0 },
        { model: "toaster", x: 6.6, z: 0.5, deg: 0, y: 1.1 },
        { model: "table-a", x: 8.5, z: 3.4, deg: 0 },
        { model: "chair-E-01", x: 7.7, z: 3.4, deg: 90, materials: { "component-1": "Fabric054" } },
        { model: "chair-E-01", x: 9.3, z: 3.4, deg: 270, materials: { "component-1": "Fabric054" } },
        // Dining
        { model: "table-b", x: 13.5, z: 2.5, deg: 0 },
        { model: "chair-B-01", x: 13.5, z: 1.4, deg: 0 },
        { model: "chair-B-01", x: 13.5, z: 3.6, deg: 180 },
        { model: "chair-B-01", x: 12.5, z: 2.5, deg: 90 },
        { model: "chair-B-01", x: 14.5, z: 2.5, deg: 270 },
        { model: "vase", x: 13.5, z: 2.5, deg: 0, y: 0.78 },
        // Bedroom
        { model: "bed-double-01", x: 8.5, z: 7.4, deg: 0, materials: { brown: "Wood095", "white-002": "Fabric054", "blue-001": "Fabric081A" } },
        { model: "drawer-a", x: 6.9, z: 5.5, deg: 0 },
        { model: "carpet-C-01", x: 10, z: 6, deg: 0 },
        { model: "plant-b", x: 10.4, z: 8.4 },
        // Bath
        { model: "bath-01", x: 13.5, z: 8.3, deg: 0 },
        { model: "toilet-01", x: 15.3, z: 5.7, deg: 270 },
        { model: "sink-01", x: 11.6, z: 5.7, deg: 90 },
        { model: "shower-door-01", x: 11.7, z: 8.2, deg: 0 },
    ],
    openings: OPENINGS_16x9("door-c"),
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 9], t: 0.62, side: 1 },
        { model: "clock", a: [0, 0], b: [6, 0], t: 0.7, side: 1 },
        { model: "mirror-a", a: [6, 5], b: [6, 9], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 5], b: [11, 9], t: 0.4, side: 1 },
        { model: "radiator-large", a: [0, 0], b: [0, 9], t: 0.88, side: 1 },
        { model: "towel-holder-01", a: [16, 5], b: [16, 9], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 09) MINIMALIST — loft mở, bê tông + gỗ sáng, đồ rất thưa, đơn sắc.
// ════════════════════════════════════════════════════════════════════════════
const minimalist = {
    file: "09-minimalist.homeverseplan",
    wallH: 3.0, wallT: 0.12,
    rooms: [
        { name: "OpenLiving", rect: [0, 0, 9, 8], floor: "Concrete042A", wallFaces: wf("PaintedPlaster017") },
        { name: "Bedroom",    rect: [9, 0, 14, 4.5], floor: "WoodFloor051", wallFaces: wf("PaintedPlaster017") },
        { name: "Bath",       rect: [9, 4.5, 14, 8], floor: "Tiles132A", wallFaces: wf("Tiles132A") },
    ],
    furniture: [
        // Open living + bếp ẩn dọc 1 tường
        { model: "sofa-d", x: 3, z: 6.6, deg: 180, materials: { "component-1": "Fabric054" } },
        { model: "carpet-B-01", x: 3, z: 4.6, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric018" } },
        { model: "table-c", x: 3, z: 4.6, deg: 0, materials: { "component-1": "Wood095", "component-2": "Wood095" } },
        { model: "plant-a", x: 0.7, z: 7.2 },
        // bếp tối giản
        { model: "cupboard-f", x: 5, z: 0.5, deg: 0, materials: { "component-1": "Plastic014A" } },
        { model: "cupboard-sink", x: 7, z: 0.5, deg: 0, materials: { "component-1": "Plastic014A" } },
        { model: "oven", x: 8.1, z: 0.5, deg: 0 },
        { model: "fridge-b", x: 8.4, z: 1.2, deg: 0 },
        { model: "table-a", x: 6.4, z: 3.2, deg: 0 },
        { model: "chair-D-01", x: 6.4, z: 2.5, deg: 0, materials: { "component-1": "Fabric054" } },
        { model: "chair-D-01", x: 6.4, z: 3.9, deg: 180, materials: { "component-1": "Fabric054" } },
        // Bedroom
        { model: "bed-double-01", x: 11.4, z: 3, deg: 180, materials: { brown: "Wood095", "white-002": "Fabric018", "blue-001": "Fabric054" } },
        { model: "drawer-b", x: 13.2, z: 0.7, deg: 0 },
        { model: "carpet-C-01", x: 10, z: 3.4, deg: 90 },
        // Bath
        { model: "bath-01", x: 11.5, z: 7.4, deg: 0 },
        { model: "sink-01", x: 9.6, z: 5, deg: 90 },
        { model: "toilet-01", x: 13.4, z: 5.1, deg: 270 },
    ],
    openings: [
        { model: "door-a", a: [0, 0], b: [9, 0], t: 0.12 },     // cửa chính
        { model: "door-a", a: [9, 0], b: [9, 4.5], t: 0.5 },    // → Bedroom
        { model: "door-a", a: [9, 4.5], b: [9, 8], t: 0.5 },    // → Bath
        { model: "window-a", a: [0, 8], b: [9, 8], t: 0.3 },    // Living dưới
        { model: "window-a", a: [0, 8], b: [9, 8], t: 0.72 },
        { model: "window-c", a: [0, 0], b: [0, 8], t: 0.4 },    // Living trái
        { model: "window-c", a: [14, 0], b: [14, 4.5], t: 0.5 },// Bedroom
        { model: "window-c", a: [14, 4.5], b: [14, 8], t: 0.6 },// Bath
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 8], t: 0.78, side: 1 },
        { model: "wall-shelf-a", a: [0, 0], b: [0, 8], t: 0.4, side: 1, materials: { "component-1": "Wood095" } },
        { model: "mirror-a", a: [9, 4.5], b: [9, 8], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [14, 4.5], b: [14, 8], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 10) WABI-SABI — mộc mạc, không hoàn hảo: đá/đất nung, gỗ cũ, vữa thô, đồ thưa.
// ════════════════════════════════════════════════════════════════════════════
const wabisabi = {
    file: "10-wabi-sabi.homeverseplan",
    wallH: 2.7, wallT: 0.2,
    rooms: [
        { name: "Living",  rect: [0, 0, 7, 7],  floor: "Travertine009", wallFaces: wf("Plaster001") },
        { name: "Kitchen", rect: [7, 0, 12, 4], floor: "Rock064",       wallFaces: wf("Plaster001") },
        { name: "Bedroom", rect: [7, 4, 12, 9], floor: "Wood026",       wallFaces: wf("Plaster001") },
        { name: "Bath",    rect: [0, 7, 7, 11], floor: "Travertine009", wallFaces: wf("Travertine009") },
        { name: "Bedroom2",rect: [7, 9, 12, 11],floor: "Wood026",       wallFaces: wf("Plaster001") },
    ],
    furniture: [
        // Living — đồ thấp, gỗ cũ, gốm
        { model: "sofa-c", x: 1.2, z: 3.5, deg: 90, materials: { "component-1": "Fabric018" } },
        { model: "table-d", x: 3.6, z: 3.5, deg: 0, materials: { "component-1": "Wood026", "component-2": "Wood060" } },
        { model: "carpet-A-01", x: 3.6, z: 3.5, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric083" } },
        { model: "chair-D-01", x: 5, z: 5, deg: 200, materials: { "component-1": "Fabric083" } },
        { model: "plant-a", x: 6.3, z: 6.3 },
        { model: "vase", x: 0.8, z: 6.3, deg: 0, y: 0 },
        { model: "shelf-e", x: 3.5, z: 0.6, deg: 0, materials: { "component-1": "Wood026" } },
        { model: "pot", x: 6.3, z: 0.7, deg: 0 },
        // Kitchen — mộc
        { model: "cupboard-d", x: 7.6, z: 0.5, deg: 0, materials: { "component-1": "Wood026" } },
        { model: "cupboard-sink", x: 8.6, z: 0.5, deg: 0, materials: { "component-1": "Wood026" } },
        { model: "oven", x: 9.7, z: 0.5, deg: 0 },
        { model: "fridge-b", x: 11.4, z: 1, deg: 0 },
        { model: "bowl", x: 8, z: 2.6, deg: 0, y: 0 },
        // Bedroom
        { model: "bed-double-01", x: 9.5, z: 6.4, deg: 0, materials: { brown: "Wood026", "white-002": "Fabric018", "blue-001": "Fabric083" } },
        { model: "drawer-b", x: 7.7, z: 4.7, deg: 0, materials: { "component-1": "Wood026" } },
        { model: "carpet-C-01", x: 11, z: 5, deg: 90 },
        { model: "plant-b", x: 11.3, z: 8.3 },
        // Bath
        { model: "bath-01", x: 5, z: 10.2, deg: 0 },
        { model: "sink-01", x: 0.6, z: 7.7, deg: 90 },
        { model: "toilet-01", x: 6.4, z: 7.7, deg: 270 },
        // Bedroom2 (phòng nhỏ / thiền)
        { model: "carpet-A-01", x: 9.5, z: 10, deg: 0, materials: { "component-1": "Fabric083", "component-2": "Fabric018" } },
        { model: "chair-D-01", x: 9.5, z: 10, deg: 0, materials: { "component-1": "Fabric018" } },
    ],
    openings: [
        { model: "door-b", a: [0, 0], b: [7, 0], t: 0.25 },    // cửa chính → Living
        { model: "door-b", a: [7, 0], b: [7, 4], t: 0.5 },     // Living ↔ Kitchen
        { model: "door-b", a: [7, 4], b: [7, 7], t: 0.5 },     // Living ↔ Bedroom
        { model: "door-b", a: [0, 7], b: [7, 7], t: 0.3 },     // Living ↔ Bath
        { model: "door-a", a: [7, 9], b: [12, 9], t: 0.5 },    // Bedroom ↔ Bedroom2
        { model: "window-c", a: [0, 0], b: [0, 7], t: 0.5 },   // Living trái
        { model: "window-a", a: [7, 0], b: [12, 0], t: 0.5 },  // Kitchen trên
        { model: "window-c", a: [12, 4], b: [12, 9], t: 0.45 },// Bedroom phải
        { model: "window-c", a: [0, 7], b: [0, 11], t: 0.6 },  // Bath trái
        { model: "window-b", a: [7, 11], b: [12, 11], t: 0.5 },// Bedroom2 dưới
    ],
    mounted: [
        { model: "wall-shelf-b", a: [0, 0], b: [0, 7], t: 0.6, side: 1, materials: { shelf: "Wood026" } },
        { model: "mirror-b", a: [0, 0], b: [7, 0], t: 0.7, side: 1 },
        { model: "clock", a: [7, 0], b: [7, 4], t: 0.7, side: -1 },
        { model: "towel-holder-01", a: [0, 7], b: [0, 11], t: 0.4, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 11) INDOCHINE — Đông Dương: gạch bông, gỗ nhiệt đới sẫm, trần cao, nhiều cây.
// ════════════════════════════════════════════════════════════════════════════
const indochine = {
    file: "11-indochine.homeverseplan",
    wallH: 3.4, wallT: 0.18,
    rooms: [
        { name: "Living",  rect: [0, 0, 7, 7],   floor: "Tiles133A", wallFaces: { left: "PaintedPlaster017", right: "Tiles105" } },
        { name: "Dining",  rect: [7, 0, 13, 4],  floor: "Tiles133A", wallFaces: wf("PaintedPlaster017") },
        { name: "Kitchen", rect: [7, 4, 13, 7],  floor: "Tiles107",  wallFaces: wf("Tiles133A") },
        { name: "Bedroom", rect: [0, 7, 7, 12],  floor: "Wood067",   wallFaces: wf("PaintedPlaster017") },
        { name: "Bath",    rect: [7, 7, 13, 12], floor: "Tiles132A", wallFaces: wf("Tiles132A") },
    ],
    furniture: [
        // Living — sofa mây gỗ sẫm, bàn nước, quạt, cây
        { model: "sofa-a", x: 3.4, z: 6, deg: 180, materials: { "component-1": "Fabric083", "component-2": "Wood067" } },
        { model: "carpet-B-01", x: 3.4, z: 4, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric083" } },
        { model: "table-c", x: 3.4, z: 4, deg: 0, materials: { "component-1": "Wood067", "component-2": "Wood066" } },
        { model: "chair-C-01", x: 1, z: 3, deg: 90, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "chair-C-01", x: 5.8, z: 3, deg: 270, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "plant-a", x: 0.7, z: 6.3 },
        { model: "plant-a", x: 6.3, z: 6.3 },
        { model: "fan", x: 6.3, z: 0.7, deg: 200 },
        { model: "globe", x: 0.8, z: 0.8, deg: 0 },
        // Dining — bàn gỗ sẫm 4 ghế
        { model: "table-b", x: 10, z: 2, deg: 90, materials: { "component-1": "Wood067" } },
        { model: "chair-C-01", x: 8.9, z: 2, deg: 90, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "chair-C-01", x: 11.1, z: 2, deg: 270, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "chair-C-01", x: 10, z: 0.9, deg: 0, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "chair-C-01", x: 10, z: 3.1, deg: 180, materials: { "component-1": "Wood067", "component-2": "Fabric083" } },
        { model: "vase", x: 10, z: 2, deg: 0, y: 0.78 },
        // Kitchen
        { model: "cupboard-f", x: 10, z: 6.5, deg: 180, materials: { "component-1": "Wood067" } },
        { model: "cupboard-sink", x: 8, z: 6.5, deg: 180, materials: { "component-1": "Wood067" } },
        { model: "oven", x: 12, z: 6.5, deg: 180 },
        { model: "fridge-a", x: 12.4, z: 4.8, deg: 0 },
        // Bedroom — giường gỗ sẫm có cột
        { model: "bed-double-01", x: 3, z: 9.4, deg: 0, materials: { brown: "Wood067", "white-002": "Fabric018", "blue-001": "Fabric083" } },
        { model: "drawer-a", x: 5.2, z: 7.5, deg: 0, materials: { "component-1": "Wood067" } },
        { model: "carpet-C-01", x: 1.2, z: 9, deg: 90 },
        { model: "plant-a", x: 0.7, z: 11.3 },
        // Bath
        { model: "bath-01", x: 11, z: 11.2, deg: 0 },
        { model: "sink-01", x: 7.6, z: 7.7, deg: 90 },
        { model: "toilet-01", x: 12.4, z: 7.7, deg: 270 },
        { model: "shower-door-01", x: 7.8, z: 11, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [0, 0], b: [7, 0], t: 0.3 },     // cửa chính → Living
        { model: "door-a", a: [7, 0], b: [7, 4], t: 0.5 },     // Living ↔ Dining
        { model: "door-c", a: [7, 4], b: [13, 4], t: 0.3 },    // Dining ↔ Kitchen
        { model: "door-a", a: [0, 7], b: [7, 7], t: 0.3 },     // Living ↔ Bedroom
        { model: "door-a", a: [7, 7], b: [13, 7], t: 0.3 },    // Kitchen ↔ Bath
        { model: "window-c", a: [0, 0], b: [0, 7], t: 0.35 },  // Living trái
        { model: "window-c", a: [0, 0], b: [0, 7], t: 0.7 },
        { model: "window-a", a: [7, 0], b: [13, 0], t: 0.5 },  // Dining trên
        { model: "window-c", a: [13, 4], b: [13, 7], t: 0.5 }, // Kitchen phải
        { model: "window-c", a: [0, 7], b: [0, 12], t: 0.55 }, // Bedroom trái
        { model: "window-c", a: [13, 7], b: [13, 12], t: 0.6 },// Bath phải
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 7], t: 0.5, side: 1 },
        { model: "mirror-b", a: [7, 0], b: [7, 4], t: 0.6, side: -1 },
        { model: "clock", a: [0, 0], b: [7, 0], t: 0.8, side: 1 },
        { model: "curtains", a: [7, 0], b: [13, 0], t: 0.5, side: 1 },
        { model: "mirror-a", a: [7, 7], b: [13, 7], t: 0.7, side: 1 },
        { model: "towel-holder-01", a: [13, 7], b: [13, 12], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 12) MEDITERRANEAN — đá travertine, tường vôi trắng, gỗ ấm, nhấn xanh biển, cây.
// ════════════════════════════════════════════════════════════════════════════
const mediterranean = {
    file: "12-mediterranean.homeverseplan",
    wallH: 3.1, wallT: 0.22,
    rooms: SHELL_16x9().map((r) => ({
        ...r,
        floor: r.name === "Bath" ? "Tiles107" : r.name === "Kitchen" ? "Tiles107" : "Travertine009",
        wallFaces: r.name === "Bath" ? wf("Tiles105") : wf("Plaster001"),
    })),
    furniture: [
        // Living — sofa vải sáng, nhấn xanh, bàn tròn, gốm
        { model: "sofa-a", x: 3, z: 7.8, deg: 180, materials: { "component-1": "Fabric018", "component-2": "Wood095" } },
        { model: "rounded-table-b", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "carpet-A-01", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Fabric063", "component-2": "Fabric018" } },
        { model: "chair-C-01", x: 1, z: 6.2, deg: 60, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "plant-a", x: 5.3, z: 8.4 },
        { model: "plant-a", x: 0.7, z: 1 },
        { model: "vase", x: 5.2, z: 5.5, deg: 0, y: 0 },
        // Kitchen
        { model: "cupboard-sink", x: 7, z: 0.45, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "oven", x: 8.3, z: 0.45, deg: 0 },
        { model: "cupboard-e", x: 9.4, z: 0.45, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "fridge-a", x: 10.4, z: 0.7, deg: 0 },
        { model: "pot", x: 6.6, z: 0.5, deg: 0, y: 1.05 },
        { model: "table-a", x: 8.5, z: 3.4, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "chair-C-01", x: 7.7, z: 3.4, deg: 90, materials: { "component-1": "Wood095", "component-2": "Fabric018" } },
        { model: "chair-C-01", x: 9.3, z: 3.4, deg: 270, materials: { "component-1": "Wood095", "component-2": "Fabric018" } },
        // Dining
        { model: "rounded-table-a", x: 13.5, z: 2.5, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "chair-C-01", x: 13.5, z: 1.2, deg: 0, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 13.5, z: 3.8, deg: 180, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 12.3, z: 2.5, deg: 90, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 14.7, z: 2.5, deg: 270, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        // Bedroom
        { model: "bed-double-01", x: 8.5, z: 7.4, deg: 0, materials: { brown: "Wood095", "white-002": "Fabric018", "blue-001": "Fabric063" } },
        { model: "drawer-a", x: 6.9, z: 5.5, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "carpet-C-01", x: 10, z: 6, deg: 0 },
        { model: "plant-b", x: 10.4, z: 8.4 },
        // Bath
        { model: "bath-01", x: 13.5, z: 8.3, deg: 0 },
        { model: "toilet-01", x: 15.3, z: 5.7, deg: 270 },
        { model: "sink-01", x: 11.6, z: 5.7, deg: 90 },
        { model: "shower-door-01", x: 11.7, z: 8.2, deg: 0 },
    ],
    openings: OPENINGS_16x9("door-b"),
    mounted: [
        { model: "mirror-b", a: [0, 0], b: [0, 9], t: 0.62, side: 1 },
        { model: "curtains", a: [0, 9], b: [6, 9], t: 0.5, side: 1 },
        { model: "clock", a: [0, 0], b: [6, 0], t: 0.7, side: 1 },
        { model: "mirror-a", a: [6, 5], b: [6, 9], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 5], b: [11, 9], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [16, 5], b: [16, 9], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 13) MODERN FARMHOUSE — gỗ ấm + vữa trắng, nhấn ván ốp & gạch, vải lanh, đen mộc.
// ════════════════════════════════════════════════════════════════════════════
const farmhouse = {
    file: "13-modern-farmhouse.homeverseplan",
    wallH: 2.9, wallT: 0.16,
    rooms: SHELL_16x9().map((r) => ({
        ...r,
        floor: r.name === "Bath" ? "Tiles138" : r.name === "Kitchen" ? "Tiles138" : "WoodFloor064",
        wallFaces:
            r.name === "Bath" ? wf("Tiles105")
            : r.name === "Living" ? { left: "Planks037A", right: "PaintedPlaster017" }
            : r.name === "Kitchen" ? { left: "Bricks058", right: "PaintedPlaster017" }
            : wf("PaintedPlaster017"),
    })),
    furniture: [
        // Living — sofa lanh, bàn gỗ thô, thảm, ghế bập bênh (chair-C)
        { model: "sofa-a", x: 3, z: 7.8, deg: 180, materials: { "component-1": "Fabric054", "component-2": "Wood066" } },
        { model: "carpet-B-01", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric083" } },
        { model: "table-c", x: 3, z: 5.8, deg: 0, materials: { "component-1": "Wood066", "component-2": "Wood066" } },
        { model: "chair-C-01", x: 1, z: 6.2, deg: 60, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        { model: "plant-a", x: 5.3, z: 8.4 },
        { model: "shelf-d", x: 3, z: 0.6, deg: 0, materials: { "component-1": "Wood066" } },
        { model: "books-b", x: 3, z: 0.7, deg: 0, y: 1.4 },
        // Kitchen — bồn tạp dề, tủ gỗ, gạch thẻ
        { model: "fridge-a", x: 6.6, z: 0.7, deg: 0 },
        { model: "cupboard-sink", x: 7.9, z: 0.45, deg: 0, materials: { "component-1": "Wood066" } },
        { model: "oven", x: 8.85, z: 0.45, deg: 0 },
        { model: "cupboard-f", x: 10.05, z: 0.45, deg: 0, materials: { "component-1": "Wood066" } },
        { model: "table-a", x: 8.5, z: 3.4, deg: 0, materials: { "component-1": "Wood066" } },
        { model: "chair-C-01", x: 7.7, z: 3.4, deg: 90, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        { model: "chair-C-01", x: 9.3, z: 3.4, deg: 270, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        // Dining — bàn dài kiểu nông trại
        { model: "table-a", x: 13.5, z: 2.5, deg: 90, materials: { "component-1": "Wood066" } },
        { model: "chair-C-01", x: 13.5, z: 1.3, deg: 0, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        { model: "chair-C-01", x: 13.5, z: 3.7, deg: 180, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        { model: "chair-C-01", x: 12.4, z: 2.5, deg: 90, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        { model: "chair-C-01", x: 14.6, z: 2.5, deg: 270, materials: { "component-1": "Wood066", "component-2": "Fabric054" } },
        // Bedroom
        { model: "bed-double-01", x: 8.5, z: 7.4, deg: 0, materials: { brown: "Wood066", "white-002": "Fabric054", "blue-001": "Fabric018" } },
        { model: "drawer-a", x: 6.9, z: 5.5, deg: 0, materials: { "component-1": "Wood066" } },
        { model: "carpet-C-01", x: 10, z: 6, deg: 0 },
        { model: "plant-b", x: 10.4, z: 8.4 },
        // Bath
        { model: "bath-01", x: 13.5, z: 8.3, deg: 0 },
        { model: "toilet-01", x: 15.3, z: 5.7, deg: 270 },
        { model: "sink-01", x: 11.6, z: 5.7, deg: 90 },
        { model: "shower-door-01", x: 11.7, z: 8.2, deg: 0 },
    ],
    openings: OPENINGS_16x9("door-c"),
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 9], t: 0.62, side: 1 },
        { model: "clock", a: [0, 0], b: [6, 0], t: 0.7, side: 1 },
        { model: "wall-shelf-a", a: [6, 0], b: [11, 0], t: 0.5, side: 1, materials: { "component-1": "Wood066" } },
        { model: "mirror-a", a: [6, 5], b: [6, 9], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 5], b: [11, 9], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [16, 5], b: [16, 9], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 14) INDUSTRIAL — loft mở, gạch trần, bê tông, thép, tối, da/đậm; ống & thang.
// ════════════════════════════════════════════════════════════════════════════
const industrial = {
    file: "14-industrial.homeverseplan",
    wallH: 3.6, wallT: 0.2,
    rooms: [
        { name: "Loft",    rect: [0, 0, 10, 9],  floor: "Concrete048", wallFaces: { left: "Bricks085", right: "Concrete046" } },
        { name: "Bedroom", rect: [10, 0, 15, 5], floor: "Concrete048", wallFaces: wf("Bricks104") },
        { name: "Bath",    rect: [10, 5, 15, 9], floor: "Tiles105",    wallFaces: wf("Concrete046") },
    ],
    furniture: [
        // Loft — khu khách
        { model: "sofa-d", x: 3, z: 7.6, deg: 180, materials: { "component-1": "Fabric083" } },
        { model: "carpet-B-01", x: 3, z: 5.6, deg: 0, materials: { "component-1": "Fabric018", "component-2": "Fabric083" } },
        { model: "table-c", x: 3, z: 5.6, deg: 0, materials: { "component-1": "Metal063", "component-2": "Wood026" } },
        { model: "chair-E-01", x: 0.9, z: 6, deg: 60, materials: { "component-1": "Fabric083", "component-2": "Metal063" } },
        { model: "shelf-b", x: 0.6, z: 2.5, deg: 90, materials: { "component-1": "Metal063" } },
        { model: "ladder", x: 9.4, z: 8.4, deg: 0 },
        { model: "plant-a", x: 5.3, z: 8.4 },
        // Loft — bếp công nghiệp dọc tường trên
        { model: "cupboard-sink", x: 6.2, z: 0.5, deg: 0, materials: { "component-1": "Metal063" } },
        { model: "oven", x: 7.3, z: 0.5, deg: 0 },
        { model: "cupboard-f", x: 8.9, z: 0.5, deg: 0, materials: { "component-1": "Metal063" } },
        { model: "fridge-b", x: 5.4, z: 1, deg: 0 },
        // Loft — bàn ăn/làm việc thép-gỗ
        { model: "table-a", x: 7.5, z: 4, deg: 90, materials: { "component-1": "Wood026" } },
        { model: "chair-E-01", x: 6.7, z: 4, deg: 90, materials: { "component-1": "Metal063", "component-2": "Wood026" } },
        { model: "chair-E-01", x: 8.3, z: 4, deg: 270, materials: { "component-1": "Metal063", "component-2": "Wood026" } },
        { model: "pc", x: 7.5, z: 3.4, deg: 90 },
        // Bedroom
        { model: "bed-double-01", x: 12.5, z: 3, deg: 180, materials: { brown: "Metal063", "white-002": "Fabric083", "blue-001": "Fabric018" } },
        { model: "drawer-a", x: 14, z: 0.9, deg: 0, materials: { "component-1": "Metal063" } },
        { model: "carpet-C-01", x: 11, z: 3.4, deg: 90 },
        // Bath
        { model: "bath-01", x: 12.5, z: 8.3, deg: 0 },
        { model: "sink-01", x: 10.6, z: 5.7, deg: 90 },
        { model: "toilet-01", x: 14.4, z: 5.7, deg: 270 },
        { model: "shower-door-01", x: 10.8, z: 8.2, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [0, 0], b: [10, 0], t: 0.12 },   // cửa chính → Loft
        { model: "door-a", a: [10, 0], b: [10, 5], t: 0.5 },   // Loft ↔ Bedroom
        { model: "door-a", a: [10, 5], b: [10, 9], t: 0.5 },   // Loft ↔ Bath
        { model: "window-b", a: [0, 0], b: [10, 0], t: 0.4 },  // Loft trên
        { model: "window-b", a: [0, 0], b: [10, 0], t: 0.7 },
        { model: "window-c", a: [0, 0], b: [0, 9], t: 0.3 },   // Loft trái
        { model: "window-c", a: [0, 0], b: [0, 9], t: 0.7 },
        { model: "window-a", a: [15, 0], b: [15, 5], t: 0.5 }, // Bedroom phải
        { model: "window-c", a: [15, 5], b: [15, 9], t: 0.6 },// Bath phải
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 9], t: 0.78, side: 1 },
        { model: "vent", a: [0, 0], b: [10, 0], t: 0.55, side: 1 },
        { model: "wall-shelf-a", a: [0, 0], b: [0, 9], t: 0.45, side: 1, materials: { "component-1": "Metal063" } },
        { model: "radiator-large", a: [10, 0], b: [10, 5], t: 0.75, side: -1 },
        { model: "mirror-a", a: [10, 5], b: [10, 9], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [15, 5], b: [15, 9], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 15) NEO-CLASSICAL — đối xứng, cẩm thạch/onyx, vữa cao, sang trọng, trần 3.8m.
// ════════════════════════════════════════════════════════════════════════════
const neoclassical = {
    file: "15-neo-classical.homeverseplan",
    wallH: 3.8, wallT: 0.3,
    rooms: [
        { name: "Foyer",    rect: [6, 0, 11, 4],   floor: "Marble012",   wallFaces: wf("Plaster001") },
        { name: "Living",   rect: [6, 4, 11, 12],  floor: "Marble012",   wallFaces: wf("Plaster001") },
        { name: "Dining",   rect: [0, 0, 6, 6],    floor: "Onyx015",     wallFaces: wf("Plaster001") },
        { name: "Kitchen",  rect: [0, 6, 6, 12],   floor: "Tiles107",    wallFaces: wf("Tiles133A") },
        { name: "Master",   rect: [11, 0, 17, 6],  floor: "WoodFloor070", wallFaces: wf("Plaster001") },
        { name: "Bath",     rect: [11, 6, 17, 12], floor: "Travertine009", wallFaces: wf("Marble012") },
    ],
    furniture: [
        // Foyer — bàn tròn + gốm, đối xứng cây
        { model: "rounded-table-a", x: 8.5, z: 2, deg: 0, materials: { "component-1": "Wood095" } },
        { model: "vase", x: 8.5, z: 2, deg: 0, y: 0.78 },
        { model: "plant-a", x: 6.7, z: 0.8 },
        { model: "plant-a", x: 10.3, z: 0.8 },
        // Living — 2 sofa đối, bàn cẩm thạch, thảm lớn
        { model: "sofa-d", x: 7.1, z: 8, deg: 90, materials: { "component-1": "Fabric081A" } },
        { model: "sofa-d", x: 9.9, z: 8, deg: 270, materials: { "component-1": "Fabric081A" } },
        { model: "sofa-c", x: 8.5, z: 11, deg: 180, materials: { "component-1": "Fabric081A" } },
        { model: "table-c", x: 8.5, z: 8, deg: 0, materials: { "component-1": "Marble012", "component-2": "Metal063" } },
        { model: "carpet-B-01", x: 8.5, z: 8.2, deg: 0, materials: { "component-1": "Fabric063", "component-2": "Fabric018" } },
        { model: "globe", x: 6.7, z: 11.2, deg: 0 },
        { model: "plant-b", x: 10.3, z: 11.3 },
        // Dining
        { model: "table-b", x: 3, z: 3, deg: 90, materials: { "component-1": "Wood095" } },
        { model: "chair-C-01", x: 1.9, z: 3, deg: 90, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 4.1, z: 3, deg: 270, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 3, z: 1.9, deg: 0, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "chair-C-01", x: 3, z: 4.1, deg: 180, materials: { "component-1": "Wood095", "component-2": "Fabric063" } },
        { model: "vase", x: 3, z: 3, deg: 0, y: 0.78 },
        // Kitchen
        { model: "cupboard-f", x: 3, z: 11.4, deg: 180, materials: { "component-1": "Wood095" } },
        { model: "cupboard-sink", x: 1, z: 8, deg: 90, materials: { "component-1": "Wood095" } },
        { model: "oven", x: 0.6, z: 9.4, deg: 90 },
        { model: "fridge-a", x: 5.3, z: 6.8, deg: 0 },
        // Master bedroom
        { model: "bed-double-01", x: 14, z: 1.8, deg: 180, materials: { brown: "Wood095", "white-002": "Fabric018", "blue-001": "Fabric063" } },
        { model: "drawer-a", x: 16, z: 4.6, deg: 270, materials: { "component-1": "Wood095" } },
        { model: "carpet-C-01", x: 13, z: 4, deg: 0 },
        { model: "plant-b", x: 16.3, z: 0.8 },
        // Master bath
        { model: "bath-01", x: 14, z: 11.2, deg: 0 },
        { model: "sink-01", x: 11.6, z: 6.7, deg: 90 },
        { model: "sink-01", x: 11.6, z: 7.7, deg: 90 },
        { model: "toilet-01", x: 16.3, z: 6.7, deg: 270 },
        { model: "shower-door-01", x: 11.8, z: 11.1, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [6, 0], b: [11, 0], t: 0.5 },    // cửa chính → Foyer
        { model: "door-c", a: [6, 4], b: [11, 4], t: 0.5 },    // Foyer ↔ Living
        { model: "door-a", a: [6, 0], b: [6, 4], t: 0.5 },     // Foyer ↔ Dining
        { model: "door-a", a: [6, 4], b: [6, 12], t: 0.25 },   // Living ↔ Kitchen
        { model: "door-a", a: [11, 0], b: [11, 4], t: 0.5 },   // Foyer ↔ Master
        { model: "door-a", a: [11, 6], b: [17, 6], t: 0.15 },  // Master ↔ Bath
        { model: "window-a", a: [0, 0], b: [0, 6], t: 0.5 },   // Dining trái
        { model: "window-c", a: [0, 6], b: [0, 12], t: 0.5 },  // Kitchen trái
        { model: "window-b", a: [6, 12], b: [11, 12], t: 0.5 },// Living dưới
        { model: "window-a", a: [17, 0], b: [17, 6], t: 0.5 }, // Master phải
        { model: "window-c", a: [17, 6], b: [17, 12], t: 0.6 },// Bath phải
    ],
    mounted: [
        { model: "mirror-b", a: [6, 0], b: [11, 0], t: 0.7, side: 1 },
        { model: "curtains", a: [6, 12], b: [11, 12], t: 0.5, side: 1 },
        { model: "clock", a: [11, 4], b: [11, 6], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 6], b: [11, 12], t: 0.35, side: 1 },
        { model: "radiator-large", a: [17, 0], b: [17, 6], t: 0.82, side: -1 },
        { model: "towel-holder-01", a: [11, 6], b: [11, 12], t: 0.7, side: 1 },
    ],
};

module.exports = [
    scandinavian,
    japandi,
    modern,
    minimalist,
    wabisabi,
    indochine,
    mediterranean,
    farmhouse,
    industrial,
    neoclassical,
];
