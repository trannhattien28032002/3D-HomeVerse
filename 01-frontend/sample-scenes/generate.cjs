/**
 * generate.js — sinh các file scene mẫu .homeverseplan để test dữ liệu.
 *
 * Vì sao cần generator thay vì viết tay JSON:
 *  - Tường phải được CHIA ĐOẠN tại mọi giao điểm (T-junction) thì RoomSystem mới
 *    dò ra phòng. Generator tự tách mọi cạnh phòng tại các node nằm trên nó.
 *  - floors[roomKey] với roomKey = các nodeId của chu vi phòng, sort + join ",".
 *    Generator gom đúng tập node chu vi nên key luôn khớp cách engine tính.
 *
 * Mỗi "house" mô tả ở cuối file: danh sách phòng (hình chữ nhật trên lưới mét),
 * nội thất (toạ độ + góc độ), cửa/cửa sổ (opening) và đồ treo tường (mount).
 *
 * Chạy:  node sample-scenes/generate.js
 */
const fs = require("fs");
const path = require("path");

const objects = require("../src/data/catalog/objects.json");
const materialsData = require("../src/data/catalog/materials.json");

const VALID_MODELS = new Set(objects.objects.map((o) => o.id));
const VALID_MATERIALS = new Set(materialsData.materials.map((m) => m.id));

// ── Helpers hình học ────────────────────────────────────────────────────────
const R2 = (n) => Math.round(n * 100) / 100; // làm tròn 2 chữ số (đơn vị mét)
const keyOf = (x, z) => `${R2(x)},${R2(z)}`;
const deg = (d) => R2((d * Math.PI) / 180); // độ → radian

/**
 * Builder: nhận rooms (rect [x1,z1,x2,z2]) → sinh nodes + walls đã chia đoạn,
 * và roomKey cho từng phòng (tập node nằm trên chu vi, sort).
 */
function buildShell(rooms, wallH, wallT) {
    // 1. Gom mọi node duy nhất = 4 góc của mỗi phòng.
    const nodeByKey = new Map(); // "x,z" -> {id,x,z}
    let nodeSeq = 1;
    const ensureNode = (x, z) => {
        const k = keyOf(x, z);
        let n = nodeByKey.get(k);
        if (!n) {
            n = { id: `n${nodeSeq++}`, x: R2(x), z: R2(z) };
            nodeByKey.set(k, n);
        }
        return n;
    };
    for (const r of rooms) {
        const [x1, z1, x2, z2] = r.rect;
        ensureNode(x1, z1); ensureNode(x2, z1); ensureNode(x2, z2); ensureNode(x1, z2);
    }
    const allNodes = [...nodeByKey.values()];

    // 2. Mỗi cạnh phòng là 1 đoạn thẳng (ngang hoặc dọc). Tìm mọi node nằm trên
    //    cạnh đó, sort theo vị trí, rồi tạo wall giữa các node liền kề.
    const onSegment = (ax, az, bx, bz) => {
        const horiz = Math.abs(az - bz) < 1e-6;
        const lo = horiz ? Math.min(ax, bx) : Math.min(az, bz);
        const hi = horiz ? Math.max(ax, bx) : Math.max(az, bz);
        const pts = allNodes.filter((n) => {
            if (horiz) return Math.abs(n.z - az) < 1e-6 && n.x >= lo - 1e-6 && n.x <= hi + 1e-6;
            return Math.abs(n.x - ax) < 1e-6 && n.z >= lo - 1e-6 && n.z <= hi + 1e-6;
        });
        pts.sort((p, q) => (horiz ? p.x - q.x : p.z - q.z));
        return pts;
    };

    const wallByKey = new Map(); // "idA|idB" -> wall
    let wallSeq = 1;
    const addWall = (na, nb, faces) => {
        const [a, b] = na.id < nb.id ? [na, nb] : [nb, na];
        const k = `${a.id}|${b.id}`;
        if (wallByKey.has(k)) return wallByKey.get(k);
        const w = {
            wallId: `w${wallSeq++}`,
            startNodeId: a.id,
            endNodeId: b.id,
            thickness: wallT,
            height: wallH,
        };
        if (faces) w.materialFaces = faces;
        wallByKey.set(k, w);
        return w;
    };

    // index để tra wall theo cặp toạ độ điểm cuối (cho opening/mount)
    const segPointsCache = [];
    for (const r of rooms) {
        const [x1, z1, x2, z2] = r.rect;
        const edges = [
            [x1, z1, x2, z1], // top
            [x2, z1, x2, z2], // right
            [x2, z2, x1, z2], // bottom
            [x1, z2, x1, z1], // left
        ];
        for (const [ax, az, bx, bz] of edges) {
            const pts = onSegment(ax, az, bx, bz);
            for (let i = 0; i < pts.length - 1; i++) addWall(pts[i], pts[i + 1], r.wallFaces);
        }
    }

    // 3. roomKey cho từng phòng: mọi node nằm trên 4 cạnh, sort theo id.
    for (const r of rooms) {
        const [x1, z1, x2, z2] = r.rect;
        const set = new Set();
        const collect = (ax, az, bx, bz) => onSegment(ax, az, bx, bz).forEach((n) => set.add(n.id));
        collect(x1, z1, x2, z1); collect(x2, z1, x2, z2);
        collect(x2, z2, x1, z2); collect(x1, z2, x1, z1);
        r.roomKey = [...set].sort().join(",");
    }

    // 4. Tra wallId của cạnh chứa đoạn (a→b): tìm wall mà 2 node của nó nằm trên
    //    đường a-b. Truyền ĐÚNG 2 đầu của 1 segment để tránh nhập nhằng.
    const nodeById = new Map(allNodes.map((n) => [n.id, n]));
    const findWall = (ax, az, bx, bz) => {
        const horiz = Math.abs(az - bz) < 1e-6;
        for (const w of wallByKey.values()) {
            const na = nodeById.get(w.startNodeId);
            const nb = nodeById.get(w.endNodeId);
            const onLine = horiz
                ? Math.abs(na.z - az) < 1e-6 && Math.abs(nb.z - az) < 1e-6
                : Math.abs(na.x - ax) < 1e-6 && Math.abs(nb.x - ax) < 1e-6;
            if (!onLine) continue;
            const within = (n) => horiz
                ? n.x >= Math.min(ax, bx) - 1e-6 && n.x <= Math.max(ax, bx) + 1e-6
                : n.z >= Math.min(az, bz) - 1e-6 && n.z <= Math.max(az, bz) + 1e-6;
            if (within(na) && within(nb)) return w;
        }
        return null;
    };

    return {
        nodes: allNodes,
        walls: [...wallByKey.values()],
        rooms,
        findWall,
    };
}

// ── Build 1 house thành SceneDocument ────────────────────────────────────────
function buildHouse(house) {
    const shell = buildShell(house.rooms, house.wallH, house.wallT);

    const furniture = (house.furniture || []).map((f) => {
        const rec = { modelId: f.model, x: R2(f.x), z: R2(f.z), rotY: f.deg != null ? deg(f.deg) : 0 };
        if (f.y != null) rec.y = R2(f.y);
        if (f.materials) rec.materials = f.materials;
        return rec;
    });

    const wallItems = [];
    for (const o of house.openings || []) {
        const w = shell.findWall(o.a[0], o.a[1], o.b[0], o.b[1]);
        if (!w) { console.warn(`[${house.file}] opening: no wall for`, o.a, o.b, o.model); continue; }
        wallItems.push({ modelId: o.model, hostWallId: w.wallId, t: R2(o.t ?? 0.5), side: 1 });
    }
    for (const m of house.mounted || []) {
        const w = shell.findWall(m.a[0], m.a[1], m.b[0], m.b[1]);
        if (!w) { console.warn(`[${house.file}] mount: no wall for`, m.a, m.b, m.model); continue; }
        const rec = { modelId: m.model, hostWallId: w.wallId, t: R2(m.t ?? 0.5), side: m.side ?? 1 };
        if (m.materials) rec.materials = m.materials;
        wallItems.push(rec);
    }

    const floors = {};
    for (const r of shell.rooms) if (r.floor) floors[r.roomKey] = r.floor;

    return {
        version: 1,
        nodes: shell.nodes,
        walls: shell.walls,
        furniture,
        wallItems,
        ...(Object.keys(floors).length ? { floors } : {}),
    };
}

// ── Validate nhẹ (mirror validate.ts) ────────────────────────────────────────
function validate(doc, file) {
    const errs = [];
    const nodeIds = new Set(doc.nodes.map((n) => n.id));
    const wallIds = new Set(doc.walls.map((w) => w.wallId));
    for (const w of doc.walls) {
        if (!nodeIds.has(w.startNodeId)) errs.push(`wall ${w.wallId} bad start`);
        if (!nodeIds.has(w.endNodeId)) errs.push(`wall ${w.wallId} bad end`);
        if (w.startNodeId === w.endNodeId) errs.push(`wall ${w.wallId} self-loop`);
    }
    for (const f of doc.furniture || []) if (!VALID_MODELS.has(f.modelId)) errs.push(`unknown furniture ${f.modelId}`);
    for (const w of doc.wallItems || []) {
        if (!VALID_MODELS.has(w.modelId)) errs.push(`unknown wallItem ${w.modelId}`);
        if (!wallIds.has(w.hostWallId)) errs.push(`wallItem ${w.modelId} bad host ${w.hostWallId}`);
        if (w.t < 0 || w.t > 1) errs.push(`wallItem ${w.modelId} t out of range`);
    }
    for (const m of Object.values(doc.floors || {})) if (!VALID_MATERIALS.has(m)) errs.push(`unknown floor mat ${m}`);
    for (const f of [...(doc.furniture || []), ...(doc.wallItems || [])]) {
        for (const v of Object.values(f.materials || {})) if (!VALID_MATERIALS.has(v)) errs.push(`unknown slot mat ${v}`);
    }
    if (errs.length) { console.error(`✗ ${file}:`, errs.slice(0, 8)); return false; }
    return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  ĐỊNH NGHĨA CÁC HOUSE
// ════════════════════════════════════════════════════════════════════════════
const HOUSES = [...require("./houses.cjs"), ...require("./houses-styles.cjs")];

let ok = 0;
for (const house of HOUSES) {
    const doc = buildHouse(house);
    const valid = validate(doc, house.file);
    const out = path.join(__dirname, house.file);
    fs.writeFileSync(out, JSON.stringify(doc, null, 2));
    const rooms = house.rooms.length;
    console.log(`${valid ? "✓" : "✗"} ${house.file.padEnd(28)} ${doc.nodes.length} nodes, ${doc.walls.length} walls, ${rooms} rooms, ${doc.furniture.length} furniture, ${doc.wallItems.length} wall-items`);
    if (valid) ok++;
}
console.log(`\n${ok}/${HOUSES.length} scenes generated OK → sample-scenes/`);
