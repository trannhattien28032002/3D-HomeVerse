/**
 * mine-ai-data.cjs — sinh data grounding cho AI Home Generation (WP-DATA).
 *
 * Mine `houses-styles.cjs` (10 scene mẫu) để suy ra tag style cho object/material
 * + room recipe, GỘP với bảng `tone`/`traits` chấm tay (kiến thức + ngữ cảnh style).
 * Mọi tag ghi rõ `source`: "mined" (xuất hiện trong scene → chắc) hoặc
 * "inferred" (suy từ tên/category → cần người review).
 *
 * Chạy:  node sample-scenes/mine-ai-data.cjs
 * Xuất:  src/ai/data/{material-tags,object-tags,room-recipes}.json
 *
 * ⚠️ DRAFT để user duyệt. tone của material & traits của object là phần chủ quan
 * nhất — chỉnh trực tiếp trong bảng dưới rồi chạy lại.
 */
const fs = require("fs");
const path = require("path");

const styles = require("./houses-styles.cjs");
const objects = require("../src/data/catalog/objects.json").objects;
const materials = require("../src/data/catalog/materials.json").materials;
const objById = Object.fromEntries(objects.map((o) => [o.id, o]));
const matById = Object.fromEntries(materials.map((m) => [m.id, m]));

const OUT_DIR = path.join(__dirname, "../src/ai/data");

// ── Màu ĐO ĐƯỢC (material-colors.json) — nguồn tone, thay bảng chấm tay ────────
// Chạy `node sample-scenes/extract-material-colors.cjs` trước để có file này.
// tone/lightness/temperature lấy thẳng từ pixel icon (linear-light average) →
// khách quan hơn đoán tay. Chỉ override khi số đo đánh lừa CHỨC NĂNG (hiếm).
let COLORS = {};
try {
  COLORS = require("../src/ai/data/material-colors.json").colors;
} catch {
  console.warn("⚠ thiếu material-colors.json — chạy extract-material-colors.cjs trước. Tạm để tone=neutral.");
}
// Override thủ công (id → tone) cho trường hợp texture thô ≠ cảm nhận khi render.
// Để rỗng nếu tin số đo hoàn toàn; thêm vào đây sau khi liếc icon nếu cần.
const TONE_OVERRIDE = {};

const NON_INTERIOR = new Set([
  "Asphalt031", "Grass001", "Grass004", "Grass005", "Ground037", "Ground103",
  "Road012A", "PavingStones150", "Gravel043",
]);

// ── Traits chấm tay (object) — vocab cố định, xem README ───────────────────────
// Vocab: low-profile clean-line minimal sleek classic ornate curved rustic
//        raw-wood woven upholstered metal-frame industrial-pipe natural tech utility
const TRAITS = {
  "chair-A-01": ["clean-line", "upholstered"], "chair-B-01": ["sleek", "minimal"],
  "chair-C-01": ["classic", "curved"], "chair-D-01": ["low-profile", "clean-line"],
  "chair-E-01": ["metal-frame", "industrial-pipe"],
  "sofa-a": ["classic", "upholstered"], "sofa-b": ["clean-line", "upholstered"],
  "sofa-c": ["low-profile", "upholstered"], "sofa-d": ["sleek", "minimal"],
  "table-a": ["clean-line"], "table-b": ["classic"], "table-c": ["minimal", "clean-line"],
  "table-d": ["low-profile", "raw-wood"], "desk": ["clean-line", "minimal"],
  "rounded-table-a": ["classic", "curved"], "rounded-table-b": ["clean-line", "curved"],
  "rounded-table-c": ["curved"],
  "bed-double-01": ["clean-line"], "bed-single-01": ["clean-line"],
  "bunk-bed-01": ["utility", "metal-frame"], "triple-bunk-bed-01": ["utility", "metal-frame"],
  "drawer-a": ["classic"], "drawer-b": ["clean-line", "minimal"],
  "shelf-a": ["clean-line"], "shelf-b": ["metal-frame", "industrial-pipe"],
  "shelf-c": ["raw-wood", "clean-line"], "shelf-d": ["rustic", "raw-wood"],
  "shelf-e": ["low-profile", "raw-wood"],
  "wall-shelf-a": ["clean-line", "minimal"], "wall-shelf-b": ["low-profile", "raw-wood"],
  "carpet-A-01": ["woven", "natural"], "carpet-B-01": ["minimal"],
  "carpet-C-01": ["woven"],
  "cupboard-d": ["raw-wood", "low-profile"], "cupboard-e": ["classic"],
  "cupboard-f": ["sleek", "minimal"],
  "plant-a": ["natural"], "plant-b": ["natural"], "pot": ["natural", "rustic"],
  "vase": ["natural"], "bowl": ["natural", "rustic"],
  "radiator-large": ["industrial-pipe", "metal-frame"], "ladder": ["raw-wood", "utility"],
  "vent": ["industrial-pipe", "metal-frame"], "pc": ["tech"],
  "fridge-b": ["sleek"], "fridge-a": ["classic"],
};
const CATEGORY_TRAIT = {
  electronics: ["tech"], windows: ["utility"], doors: ["utility"],
  bathroom: ["clean-line"], kitchen: ["utility"],
};

// ── Mine từ scene ─────────────────────────────────────────────────────────────
const styleName = (f) => f.file.replace(/^\d+-/, "").replace(".homeverseplan", "");
const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
const roomType = (n) => {
  n = n.toLowerCase();
  if (/living|salon|lounge|sitting|loft/.test(n)) return "living";
  if (/master|bed/.test(n)) return "bedroom";
  if (/kitchen/.test(n)) return "kitchen";
  if (/bath|ofuro|wc/.test(n)) return "bathroom";
  if (/dining/.test(n)) return "dining";
  if (/study|office|library/.test(n)) return "study";
  if (/foyer|genkan|hall|entry/.test(n)) return "foyer";
  return null;
};

const matStyles = {}; // id -> Set
const objStyles = {}; // id -> Set
const recipe = {}; // roomType -> { category -> { modelId -> count } }
const addMat = (id, s) => { (matStyles[id] = matStyles[id] || new Set()).add(s); };

for (const st of styles) {
  const sn = styleName(st);
  for (const r of st.rooms) {
    if (r.floor) addMat(r.floor, sn);
    if (r.wallFaces) for (const v of Object.values(r.wallFaces)) addMat(v, sn);
  }
  for (const f of [...(st.furniture || []), ...(st.mounted || [])]) {
    (objStyles[f.model] = objStyles[f.model] || new Set()).add(sn);
    if (f.materials) for (const v of Object.values(f.materials)) addMat(v, sn);
    let x = f.x, z = f.z;
    if (x == null && f.a && f.b) { x = (f.a[0] + f.b[0]) / 2; z = (f.a[1] + f.b[1]) / 2; }
    let rt = null;
    for (const r of st.rooms) if (inRect(x, z, r.rect)) { rt = roomType(r.name); break; }
    if (rt) {
      const o = objById[f.model];
      const cat = o ? o.category : "unknown";
      recipe[rt] = recipe[rt] || {};
      recipe[rt][cat] = recipe[rt][cat] || {};
      recipe[rt][cat][f.model] = (recipe[rt][cat][f.model] || 0) + 1;
    }
  }
}

// ── Build material-tags.json ──────────────────────────────────────────────────
const materialTags = {
  _status: "draft-for-review",
  _note: "tone/lightness/temperature/hex = ĐO từ icon (material-colors.json, linear-light avg); style = mined từ scene mẫu. TONE_OVERRIDE trong generator nếu cần sửa tay.",
  tags: {},
};
for (const m of materials) {
  const used = matStyles[m.id];
  const c = COLORS[m.id];
  materialTags.tags[m.id] = {
    category: m.category,
    tone: TONE_OVERRIDE[m.id] || (c ? c.suggestedTone : "neutral"),
    lightness: c ? c.lightness : null,
    temperature: c ? c.temperature : null,
    hex: c ? c.avgHex : null,
    style: used ? [...used].sort() : [],
    interior: !NON_INTERIOR.has(m.id),
    source: used ? "mined" : "inferred",
    toneSource: TONE_OVERRIDE[m.id] ? "override" : c ? "measured" : "default",
  };
}

// ── Build object-tags.json ────────────────────────────────────────────────────
const objectTags = {
  _status: "draft-for-review",
  _note: "style = mined từ scene mẫu (UNUSED → []=hợp mọi style, cần review). traits chấm tay.",
  tags: {},
};
for (const o of objects) {
  const used = objStyles[o.id];
  objectTags.tags[o.id] = {
    name: o.name,
    category: o.category,
    style: used ? [...used].sort() : [],
    traits: TRAITS[o.id] || CATEGORY_TRAIT[o.category] || [],
    source: used ? "mined" : "inferred",
  };
}

// ── Build room-recipes.json (mined; sắp theo tần suất) ─────────────────────────
const recipeOut = { _status: "draft-for-review", _note: "Mined từ 10 scene; count = số scene dùng. Role required do người chốt.", rooms: {} };
for (const [rt, cats] of Object.entries(recipe)) {
  recipeOut.rooms[rt] = {};
  for (const [cat, models] of Object.entries(cats)) {
    recipeOut.rooms[rt][cat] = Object.entries(models)
      .sort((a, b) => b[1] - a[1])
      .map(([modelId, count]) => ({ modelId, count }));
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", name);
};
write("material-tags.json", materialTags);
write("object-tags.json", objectTags);
write("room-recipes.json", recipeOut);

// Báo cáo độ phủ style (object có style tag) — phục vụ quyết bổ sung GLB.
const coverage = {};
for (const o of objects) for (const s of objStyles[o.id] || []) coverage[s] = (coverage[s] || 0) + 1;
console.log("\n=== STYLE COVERAGE (số object mined/style) ===");
for (const [s, n] of Object.entries(coverage).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);
const unusedObj = objects.filter((o) => !objStyles[o.id]).length;
console.log(`  (objects chưa xuất hiện trong scene nào: ${unusedObj}/${objects.length})`);
