/**
 * houses.js — 5 mẫu nhà nhiều phòng, mỗi phong cách một bố cục + bảng vật liệu riêng.
 *
 * Quy ước toạ độ: mặt phẳng X-Z (mét), Z tăng = đi "xuống" trên mặt bằng.
 *   rooms[].rect = [x1, z1, x2, z2]  (góc trên-trái → dưới-phải)
 *   furniture deg = góc xoay quanh trục đứng, theo ĐỘ (generator đổi sang radian)
 *   openings/mounted: a,b là 2 ĐẦU của đúng 1 đoạn tường (đã chia tại giao điểm)
 *
 * Mọi modelId/materialId đều lấy từ objects.json / materials.json.
 */

// ════════════════════════════════════════════════════════════════════════════
// 1) HIỆN ĐẠI — "modern-villa": 1 tầng mở, phòng khách lớn thông 2 nhịp.
// ════════════════════════════════════════════════════════════════════════════
const modern = {
    file: "01-hien-dai.homeverseplan",
    wallH: 2.9, wallT: 0.15,
    rooms: [
        { name: "Living",  rect: [0, 0, 6, 9],   floor: "WoodFloor043", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Kitchen", rect: [6, 0, 11, 5],  floor: "Tiles138",     wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Dining",  rect: [11, 0, 16, 5], floor: "WoodFloor043", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Bedroom", rect: [6, 5, 11, 9],  floor: "WoodFloor043", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Bath",    rect: [11, 5, 16, 9], floor: "Tiles138",     wallFaces: { left: "Tiles105", right: "Tiles105" } },
    ],
    furniture: [
        // Living
        { model: "sofa-a", x: 3, z: 8, deg: 180 },
        { model: "carpet-B-01", x: 3, z: 6 },
        { model: "table-c", x: 3, z: 6 },
        { model: "chair-D-01", x: 1.2, z: 6.4, deg: 45 },
        { model: "plant-a", x: 5.3, z: 8.4 },
        { model: "shelf-c", x: 3, z: 0.6, deg: 0 },
        { model: "globe", x: 5.2, z: 1, deg: 0 },
        // Kitchen counters along top wall
        { model: "cupboard-sink", x: 7, z: 0.45, deg: 0 },
        { model: "oven", x: 8.3, z: 0.45, deg: 0 },
        { model: "dishwasher", x: 9.4, z: 0.45, deg: 0 },
        { model: "fridge-a", x: 10.4, z: 0.7, deg: 0 },
        { model: "kettle", x: 6.5, z: 0.45, deg: 0, y: 1.2 },
        { model: "toaster", x: 6.9, z: 1, deg: 0, y: 1.1 },
        { model: "table-a", x: 8.5, z: 3.4, deg: 0 },
        { model: "chair-A-01", x: 8.5, z: 2.6, deg: 0 },
        { model: "chair-A-01", x: 8.5, z: 4.2, deg: 180 },
        // Dining
        { model: "table-b", x: 13.5, z: 2.5, deg: 0 },
        { model: "chair-B-01", x: 13.5, z: 1.4, deg: 0 },
        { model: "chair-B-01", x: 13.5, z: 3.6, deg: 180 },
        { model: "chair-B-01", x: 12.5, z: 2.5, deg: 90 },
        { model: "chair-B-01", x: 14.5, z: 2.5, deg: 270 },
        { model: "vase", x: 13.5, z: 2.5, deg: 0, y: 0.9 },
        // Bedroom
        { model: "bed-double-01", x: 8.5, z: 7.4, deg: 0 },
        { model: "drawer-a", x: 6.7, z: 5.5, deg: 0 },
        { model: "carpet-C-01", x: 9.6, z: 6 },
        { model: "plant-b", x: 10.4, z: 8.4 },
        // Bath
        { model: "bath-01", x: 13.5, z: 8.3, deg: 0 },
        { model: "toilet-01", x: 15.3, z: 5.7, deg: 270 },
        { model: "sink-01", x: 11.6, z: 5.7, deg: 90 },
        { model: "shower-door-01", x: 11.7, z: 8.2, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [0, 0], b: [6, 0], t: 0.35 },          // cửa chính → Living (tường trên)
        { model: "door-a", a: [6, 0], b: [6, 5], t: 0.5 },           // Living ↔ Kitchen
        { model: "door-a", a: [6, 5], b: [6, 9], t: 0.5 },           // Living ↔ Bedroom
        { model: "door-c", a: [11, 0], b: [11, 5], t: 0.5 },         // Kitchen ↔ Dining
        { model: "door-a", a: [11, 5], b: [11, 9], t: 0.5 },         // Bedroom ↔ Bath
        { model: "window-c", a: [0, 0], b: [0, 9], t: 0.25 },        // Living tường trái
        { model: "window-b", a: [0, 9], b: [6, 9], t: 0.5 },         // Living tường dưới
        { model: "window-a", a: [6, 0], b: [11, 0], t: 0.5 },        // Kitchen
        { model: "window-a", a: [16, 0], b: [16, 5], t: 0.5 },       // Dining tường phải
        { model: "window-b", a: [6, 9], b: [11, 9], t: 0.5 },        // Bedroom
        { model: "window-c", a: [16, 5], b: [16, 9], t: 0.7 },       // Bath
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 9], t: 0.62, side: 1 },   // TV phòng khách
        { model: "mirror-a", a: [6, 5], b: [6, 9], t: 0.5, side: 1 },        // gương phòng ngủ
        { model: "mirror-a", a: [11, 5], b: [11, 9], t: 0.4, side: 1 },      // gương lavabo
        { model: "towel-holder-01", a: [16, 5], b: [16, 9], t: 0.3, side: -1 },
        { model: "clock", a: [0, 0], b: [6, 0], t: 0.7, side: 1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 2) CỔ ĐIỂN — "classical-manor": sảnh trung tâm + các phòng đối xứng, tường dày.
// ════════════════════════════════════════════════════════════════════════════
const classical = {
    file: "02-co-dien.homeverseplan",
    wallH: 3.6, wallT: 0.25,
    rooms: [
        { name: "Hall",    rect: [6, 0, 11, 10],  floor: "Marble012",   wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Salon",   rect: [0, 0, 6, 5],    floor: "WoodFloor064", wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Library", rect: [0, 5, 6, 10],   floor: "WoodFloor064", wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Dining",  rect: [11, 0, 17, 5],  floor: "Marble012",   wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Kitchen", rect: [11, 5, 17, 10], floor: "Tiles107",    wallFaces: { left: "Tiles133A", right: "Tiles133A" } },
    ],
    furniture: [
        // Hall (sảnh)
        { model: "rounded-table-a", x: 8.5, z: 5, deg: 0 },
        { model: "vase", x: 8.5, z: 5, deg: 0, y: 0.9 },
        { model: "plant-a", x: 6.6, z: 0.7 },
        { model: "plant-a", x: 10.3, z: 0.7 },
        { model: "carpet-B-01", x: 8.5, z: 8, deg: 90 },
        // Salon
        { model: "sofa-c", x: 3, z: 1, deg: 0 },
        { model: "sofa-c", x: 3, z: 4, deg: 180 },
        { model: "table-c", x: 3, z: 2.5, deg: 0 },
        { model: "rounded-table-b", x: 5.2, z: 4.2, deg: 0 },
        // Library
        { model: "shelf-a", x: 0.6, z: 6, deg: 90 },
        { model: "shelf-a", x: 0.6, z: 8, deg: 90 },
        { model: "desk", x: 3, z: 8.4, deg: 0 },
        { model: "chair-A-01", x: 3, z: 7.4, deg: 0 },
        { model: "books-a", x: 3.3, z: 8.4, deg: 0, y: 0.85 },
        { model: "globe", x: 5.2, z: 6, deg: 0 },
        // Dining
        { model: "table-b", x: 14, z: 2.5, deg: 90 },
        { model: "chair-C-01", x: 12.9, z: 2.5, deg: 90 },
        { model: "chair-C-01", x: 15.1, z: 2.5, deg: 270 },
        { model: "chair-C-01", x: 14, z: 1.2, deg: 0 },
        { model: "chair-C-01", x: 14, z: 3.8, deg: 180 },
        { model: "vase", x: 14, z: 2.5, deg: 0, y: 0.95 },
        // Kitchen
        { model: "cupboard-f", x: 14, z: 9.4, deg: 180 },
        { model: "cupboard-sink", x: 12, z: 9.4, deg: 180 },
        { model: "oven", x: 16, z: 9.4, deg: 180 },
        { model: "fridge-b", x: 16.5, z: 5.8, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [6, 0], b: [11, 0], t: 0.5 },          // cửa chính → Hall
        { model: "door-a", a: [6, 0], b: [6, 5], t: 0.5 },           // Hall ↔ Salon
        { model: "door-a", a: [6, 5], b: [6, 10], t: 0.5 },          // Hall ↔ Library
        { model: "door-a", a: [11, 0], b: [11, 5], t: 0.5 },         // Hall ↔ Dining
        { model: "door-a", a: [11, 5], b: [11, 10], t: 0.5 },        // Hall ↔ Kitchen
        { model: "window-c", a: [0, 0], b: [0, 5], t: 0.5 },         // Salon
        { model: "window-c", a: [0, 5], b: [0, 10], t: 0.5 },        // Library
        { model: "window-a", a: [17, 0], b: [17, 5], t: 0.5 },       // Dining
        { model: "window-c", a: [17, 5], b: [17, 10], t: 0.5 },      // Kitchen
        { model: "window-b", a: [6, 0], b: [11, 0], t: 0.18 },       // Hall trên
    ],
    mounted: [
        { model: "mirror-b", a: [6, 0], b: [6, 5], t: 0.5, side: -1 },       // gương salon
        { model: "curtains", a: [0, 0], b: [0, 5], t: 0.5, side: 1 },
        { model: "curtains", a: [0, 5], b: [0, 10], t: 0.5, side: 1 },
        { model: "clock", a: [11, 0], b: [11, 5], t: 0.7, side: -1 },        // đồng hồ dining
        { model: "radiator-large", a: [17, 0], b: [17, 5], t: 0.8, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 3) TỐI GIẢN — "minimal-loft": ít vách, bê tông + gỗ sáng, đồ đạc thưa.
// ════════════════════════════════════════════════════════════════════════════
const minimal = {
    file: "03-toi-gian.homeverseplan",
    wallH: 2.8, wallT: 0.12,
    rooms: [
        { name: "LivingKitchen", rect: [0, 0, 9, 7], floor: "Concrete042A", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Bedroom",       rect: [9, 0, 14, 4], floor: "WoodFloor051", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Bath",          rect: [9, 4, 14, 7], floor: "Tiles132A",   wallFaces: { left: "Tiles132A", right: "Tiles132A" } },
    ],
    furniture: [
        // Living + bếp mở
        { model: "sofa-b", x: 2.5, z: 5.5, deg: 180 },
        { model: "carpet-C-01", x: 2.5, z: 4, deg: 0 },
        { model: "table-d", x: 2.5, z: 4, deg: 0 },
        { model: "plant-a", x: 0.7, z: 6.3 },
        { model: "cupboard-f", x: 4.5, z: 0.5, deg: 0 },
        { model: "cupboard-sink", x: 6.4, z: 0.5, deg: 0 },
        { model: "oven", x: 7.5, z: 0.5, deg: 0 },
        { model: "fridge-b", x: 8.3, z: 1, deg: 0 },
        { model: "table-a", x: 6, z: 3, deg: 0 },
        { model: "chair-D-01", x: 6, z: 2.3, deg: 0 },
        { model: "chair-D-01", x: 6, z: 3.7, deg: 180 },
        // Bedroom
        { model: "bed-double-01", x: 11.5, z: 2.6, deg: 180 },
        { model: "drawer-b", x: 13.2, z: 0.7, deg: 0 },
        { model: "carpet-C-01", x: 10.2, z: 3, deg: 90 },
        // Bath
        { model: "bath-01", x: 11.5, z: 6.4, deg: 0 },
        { model: "sink-01", x: 9.6, z: 4.5, deg: 90 },
        { model: "toilet-01", x: 13.4, z: 4.6, deg: 270 },
    ],
    openings: [
        { model: "door-a", a: [0, 0], b: [9, 0], t: 0.12 },          // cửa chính
        { model: "door-a", a: [9, 0], b: [9, 4], t: 0.5 },           // → Bedroom
        { model: "door-a", a: [9, 4], b: [9, 7], t: 0.5 },           // → Bath
        { model: "window-a", a: [0, 7], b: [9, 7], t: 0.3 },         // Living
        { model: "window-a", a: [0, 7], b: [9, 7], t: 0.7 },
        { model: "window-c", a: [14, 0], b: [14, 4], t: 0.5 },       // Bedroom
        { model: "window-c", a: [14, 4], b: [14, 7], t: 0.6 },       // Bath
    ],
    mounted: [
        { model: "television-b", a: [0, 0], b: [0, 7], t: 0.78, side: 1 },
        { model: "wall-shelf-a", a: [0, 0], b: [0, 7], t: 0.35, side: 1 },
        { model: "mirror-a", a: [9, 4], b: [9, 7], t: 0.4, side: 1 },
        { model: "towel-holder-01", a: [14, 4], b: [14, 7], t: 0.3, side: -1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 4) TÂN CỔ ĐIỂN — "neoclassical-residence": đá cẩm thạch, đối xứng, sang trọng.
// ════════════════════════════════════════════════════════════════════════════
const neoclassical = {
    file: "04-tan-co-dien.homeverseplan",
    wallH: 3.8, wallT: 0.28,
    rooms: [
        { name: "Foyer",      rect: [5, 0, 11, 4],   floor: "Marble012",   wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "GrandLiving",rect: [5, 4, 11, 11],  floor: "Marble012",   wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Dining",     rect: [0, 0, 5, 5.5],  floor: "Onyx015",     wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "Kitchen",    rect: [0, 5.5, 5, 11], floor: "Tiles107",    wallFaces: { left: "Tiles133A", right: "Tiles133A" } },
        { name: "MasterBed",  rect: [11, 0, 17, 6],  floor: "WoodFloor070", wallFaces: { left: "Plaster001", right: "Plaster001" } },
        { name: "MasterBath", rect: [11, 6, 17, 11], floor: "Travertine009", wallFaces: { left: "Marble012", right: "Marble012" } },
    ],
    furniture: [
        // Foyer
        { model: "rounded-table-a", x: 8, z: 2, deg: 0 },
        { model: "vase", x: 8, z: 2, deg: 0, y: 0.95 },
        { model: "plant-a", x: 5.7, z: 0.8 },
        { model: "plant-a", x: 10.3, z: 0.8 },
        // Grand living
        { model: "sofa-d", x: 6.5, z: 6, deg: 90 },
        { model: "sofa-d", x: 9.5, z: 6, deg: 270 },
        { model: "sofa-c", x: 8, z: 9.5, deg: 180 },
        { model: "table-c", x: 8, z: 6.5, deg: 0 },
        { model: "carpet-B-01", x: 8, z: 7, deg: 0 },
        { model: "plant-b", x: 10.3, z: 10.3 },
        { model: "globe", x: 5.7, z: 10.3 },
        // Dining
        { model: "table-b", x: 2.5, z: 2.7, deg: 0 },
        { model: "chair-C-01", x: 2.5, z: 1.5, deg: 0 },
        { model: "chair-C-01", x: 2.5, z: 3.9, deg: 180 },
        { model: "chair-C-01", x: 1.4, z: 2.7, deg: 90 },
        { model: "chair-C-01", x: 3.6, z: 2.7, deg: 270 },
        { model: "vase", x: 2.5, z: 2.7, deg: 0, y: 0.95 },
        // Kitchen
        { model: "cupboard-f", x: 2.5, z: 10.4, deg: 180 },
        { model: "cupboard-sink", x: 0.7, z: 8, deg: 90 },
        { model: "oven", x: 0.6, z: 9.5, deg: 90 },
        { model: "fridge-a", x: 4.3, z: 6.3, deg: 0 },
        // Master bedroom
        { model: "bed-double-01", x: 14, z: 1.7, deg: 180 },
        { model: "drawer-a", x: 16, z: 4.5, deg: 270 },
        { model: "carpet-C-01", x: 13, z: 4, deg: 0 },
        { model: "plant-b", x: 16.3, z: 0.8 },
        // Master bath
        { model: "bath-01", x: 14, z: 10.3, deg: 0 },
        { model: "sink-01", x: 11.6, z: 6.7, deg: 90 },
        { model: "sink-01", x: 11.6, z: 7.7, deg: 90 },
        { model: "toilet-01", x: 16.3, z: 6.7, deg: 270 },
        { model: "shower-door-01", x: 11.8, z: 10.2, deg: 0 },
    ],
    openings: [
        { model: "door-c", a: [5, 0], b: [11, 0], t: 0.5 },          // cửa chính → Foyer
        { model: "door-c", a: [5, 4], b: [11, 4], t: 0.5 },          // Foyer ↔ Grand living
        { model: "door-a", a: [5, 0], b: [5, 4], t: 0.5 },           // Foyer ↔ Dining
        { model: "door-a", a: [5, 4], b: [5, 11], t: 0.2 },          // Living ↔ Kitchen
        { model: "door-a", a: [11, 0], b: [11, 4], t: 0.5 },         // Foyer ↔ Master bed
        { model: "door-a", a: [11, 6], b: [17, 6], t: 0.15 },        // Master bed ↔ bath
        { model: "window-a", a: [0, 0], b: [0, 5.5], t: 0.5 },       // Dining
        { model: "window-c", a: [0, 5.5], b: [0, 11], t: 0.5 },      // Kitchen
        { model: "window-b", a: [5, 11], b: [11, 11], t: 0.5 },      // Grand living
        { model: "window-a", a: [17, 0], b: [17, 6], t: 0.5 },       // Master bed
        { model: "window-c", a: [17, 6], b: [17, 11], t: 0.6 },      // Master bath
    ],
    mounted: [
        { model: "mirror-b", a: [5, 0], b: [11, 0], t: 0.7, side: 1 },       // gương foyer
        { model: "curtains", a: [5, 11], b: [11, 11], t: 0.5, side: 1 },
        { model: "clock", a: [11, 4], b: [11, 6], t: 0.5, side: 1 },
        { model: "mirror-a", a: [11, 6], b: [11, 11], t: 0.35, side: 1 },    // gương lavabo
        { model: "radiator-large", a: [17, 0], b: [17, 6], t: 0.8, side: -1 },
        { model: "towel-holder-01", a: [11, 6], b: [11, 11], t: 0.7, side: 1 },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// 5) NHẬT BẢN — "japanese-house": genkan, phòng tatami, đồ thấp, gỗ mộc.
// ════════════════════════════════════════════════════════════════════════════
const japanese = {
    file: "05-nhat-ban.homeverseplan",
    wallH: 2.5, wallT: 0.12,
    rooms: [
        { name: "Genkan",   rect: [0, 0, 3, 3],   floor: "Travertine009", wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Living",   rect: [3, 0, 9, 6],   floor: "WoodFloor039",  wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Tatami",   rect: [0, 3, 3, 8],   floor: "WoodFloor040",  wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Kitchen",  rect: [9, 0, 13, 6],  floor: "Tiles138",      wallFaces: { left: "Tiles132A", right: "Tiles132A" } },
        { name: "Bedroom",  rect: [3, 6, 9, 11],  floor: "WoodFloor040",  wallFaces: { left: "PaintedPlaster017", right: "PaintedPlaster017" } },
        { name: "Ofuro",    rect: [9, 6, 13, 11], floor: "Tiles132A",     wallFaces: { left: "Tiles132A", right: "Tiles132A" } },
    ],
    furniture: [
        // Genkan (sảnh cởi giày)
        { model: "shelf-d", x: 0.6, z: 2.4, deg: 90 },
        { model: "plant-b", x: 2.3, z: 0.7 },
        // Living (chiếu + bàn trà thấp)
        { model: "carpet-B-01", x: 6, z: 3, deg: 0 },
        { model: "table-d", x: 6, z: 3, deg: 0 },
        { model: "chair-D-01", x: 6, z: 1.8, deg: 0 },
        { model: "chair-D-01", x: 6, z: 4.2, deg: 180 },
        { model: "chair-D-01", x: 4.8, z: 3, deg: 90 },
        { model: "chair-D-01", x: 7.2, z: 3, deg: 270 },
        { model: "plant-a", x: 8.3, z: 5.3 },
        { model: "vase", x: 3.5, z: 5.3, deg: 0 },
        // Tatami (phòng trà)
        { model: "rounded-table-c", x: 1.5, z: 5.5, deg: 0 },
        { model: "shelf-e", x: 0.6, z: 7.3, deg: 90 },
        // Kitchen
        { model: "cupboard-d", x: 9.6, z: 0.5, deg: 0 },
        { model: "cupboard-sink", x: 10.5, z: 0.5, deg: 0 },
        { model: "oven", x: 11.6, z: 0.5, deg: 0 },
        { model: "fridge-b", x: 12.4, z: 1, deg: 0 },
        { model: "table-a", x: 11, z: 4, deg: 0 },
        { model: "chair-C-01", x: 11, z: 3.2, deg: 0 },
        { model: "chair-C-01", x: 11, z: 4.8, deg: 180 },
        // Bedroom (futon — dùng nệm thấp)
        { model: "bed-double-01", x: 6, z: 8.4, deg: 0 },
        { model: "drawer-b", x: 3.7, z: 6.7, deg: 0 },
        { model: "carpet-C-01", x: 7.6, z: 7.4, deg: 0 },
        { model: "plant-b", x: 8.3, z: 10.3 },
        // Ofuro (phòng tắm Nhật)
        { model: "bath-01", x: 11, z: 10.2, deg: 0 },
        { model: "sink-01", x: 9.6, z: 6.6, deg: 90 },
        { model: "toilet-01", x: 12.4, z: 6.7, deg: 270 },
        { model: "shower-door-01", x: 9.8, z: 10, deg: 0 },
    ],
    openings: [
        { model: "door-a", a: [0, 0], b: [3, 0], t: 0.5 },           // cửa chính → Genkan
        { model: "door-a", a: [3, 0], b: [3, 3], t: 0.5 },           // Genkan ↔ Living
        { model: "door-a", a: [0, 3], b: [3, 3], t: 0.5 },           // Genkan ↔ Tatami
        { model: "door-c", a: [9, 0], b: [9, 6], t: 0.3 },           // Living ↔ Kitchen
        { model: "door-a", a: [3, 6], b: [9, 6], t: 0.25 },          // Living ↔ Bedroom
        { model: "door-a", a: [9, 6], b: [9, 11], t: 0.5 },          // Bedroom ↔ Ofuro
        { model: "window-b", a: [3, 0], b: [9, 0], t: 0.6 },         // Living
        { model: "window-c", a: [0, 3], b: [0, 8], t: 0.6 },         // Tatami
        { model: "window-c", a: [13, 0], b: [13, 6], t: 0.5 },       // Kitchen
        { model: "window-b", a: [3, 11], b: [9, 11], t: 0.5 },       // Bedroom
        { model: "window-c", a: [13, 6], b: [13, 11], t: 0.6 },      // Ofuro
    ],
    mounted: [
        { model: "television-b", a: [3, 0], b: [3, 3], t: 0.5, side: 1 },
        { model: "wall-shelf-b", a: [3, 0], b: [9, 0], t: 0.25, side: 1 },
        { model: "clock", a: [3, 0], b: [9, 0], t: 0.85, side: 1 },
        { model: "mirror-a", a: [9, 6], b: [9, 11], t: 0.35, side: 1 },
        { model: "towel-holder-01", a: [13, 6], b: [13, 11], t: 0.3, side: -1 },
    ],
};

module.exports = [modern, classical, minimal, neoclassical, japanese];
