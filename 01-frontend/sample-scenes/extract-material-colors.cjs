/**
 * extract-material-colors.cjs — đo MÀU CHỦ ĐẠO của từng material từ icon .webp.
 *
 * Dùng `sharp` decode icon (đường dẫn lấy từ materials.json .icon), tính:
 *   - avg  : màu trung bình (resize 1×1) — đại diện "tông tổng thể"
 *   - dom  : màu trội nhất (sharp.stats().dominant)
 * → quy ra lightness (light|medium|dark) + temperature (warm|cool|neutral)
 *   + suggestedTone (1 nhãn theo luật) để đối chiếu với tone chấm tay.
 *
 * Chạy:  node sample-scenes/extract-material-colors.cjs
 * Xuất:  src/ai/data/material-colors.json  (+ in bảng so sánh ra console)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const materials = require(path.join(ROOT, "src/data/catalog/materials.json")).materials;
let currentTags = {};
try {
  currentTags = require(path.join(ROOT, "src/ai/data/material-tags.json")).tags;
} catch { /* chưa có cũng không sao */ }

const clamp = (v) => Math.max(0, Math.min(255, v));
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("");
}
// RGB(0-255) → HSL (h:0-360, s:0-100, l:0-100)
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

// ── Luật quy nhãn (tinh chỉnh sau khi xem số thật) ────────────────────────────
// Ngưỡng cho L đo trong linear-light (đã hiệu chỉnh gamma). Tertile hợp lý cho
// tập material nội thất: ~L≥61 sáng, ~L≤33 tối.
function classifyLightness(l) {
  if (l >= 61) return "light";
  if (l <= 33) return "dark";
  return "medium";
}
function classifyTemperature(h, s) {
  if (s < 12) return "neutral"; // gần xám → vô sắc
  if ((h >= 0 && h <= 70) || h >= 330) return "warm"; // đỏ/cam/vàng
  if (h >= 160 && h <= 280) return "cool"; // lục/lam
  return "neutral"; // vùng còn lại (lục-vàng, tím) coi như trung tính
}
// tone đơn (giữ schema cũ): ưu tiên thái cực sáng/tối, giữa thì theo nhiệt màu.
function suggestTone(light, temp) {
  if (light === "light") return "light";
  if (light === "dark") return "dark";
  if (temp === "warm") return "warm";
  if (temp === "cool") return "cool";
  return "medium";
}

// sRGB(0-255) ↔ linear. Trung bình PHẢI làm trong linear light, nếu không màu
// sáng bị kéo tối (lỗi gamma kinh điển) → light material đo nhầm thành medium.
const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linToSrgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

async function avgColor(file) {
  // Downscale 256² cho nhanh, đọc raw, linear-hoá từng pixel rồi mới trung bình.
  const { data, info } = await sharp(file).removeAlpha().resize(256, 256, { fit: "fill" })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 3 (đã removeAlpha)
  let R = 0, G = 0, B = 0; const n = data.length / ch;
  for (let i = 0; i < data.length; i += ch) {
    R += srgbToLin(data[i]); G += srgbToLin(data[i + 1]); B += srgbToLin(data[i + 2]);
  }
  return { r: linToSrgb(R / n), g: linToSrgb(G / n), b: linToSrgb(B / n) };
}

async function main() {
  const out = {
    _status: "measured",
    _note: "Màu đo từ icon .webp bằng sharp. avg=trung bình, dom=màu trội. suggestedTone theo luật trong extract-material-colors.cjs.",
    colors: {},
  };
  const rows = [];
  for (const m of materials) {
    const file = path.join(ROOT, "public", m.icon);
    try {
      const avg = await avgColor(file);
      let dom = null;
      try { dom = (await sharp(file).stats()).dominant; } catch { /* ignore */ }
      const hsl = rgbToHsl(avg.r, avg.g, avg.b);
      const light = classifyLightness(hsl.l);
      const temp = classifyTemperature(hsl.h, hsl.s);
      const suggestedTone = suggestTone(light, temp);
      out.colors[m.id] = {
        category: m.category,
        avgHex: rgbToHex(avg.r, avg.g, avg.b),
        domHex: dom ? rgbToHex(dom.r, dom.g, dom.b) : null,
        hsl: { h: Math.round(hsl.h), s: Math.round(hsl.s), l: Math.round(hsl.l) },
        lightness: light,
        temperature: temp,
        suggestedTone,
      };
      rows.push({ id: m.id, cat: m.category, hex: out.colors[m.id].avgHex,
        hsl: `${Math.round(hsl.h)},${Math.round(hsl.s)},${Math.round(hsl.l)}`,
        light, temp, suggest: suggestedTone, current: currentTags[m.id]?.tone ?? "-" });
    } catch (e) {
      console.error("FAIL", m.id, m.icon, e.message);
    }
  }

  const outDir = path.join(ROOT, "src/ai/data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "material-colors.json"), JSON.stringify(out, null, 2) + "\n");

  // Bảng so sánh: ⚠ đánh dấu nơi tone chấm tay KHÁC đề xuất theo màu.
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("id", 20), pad("cat", 11), pad("avgHex", 9), pad("h,s,l", 12), pad("light", 8), pad("temp", 8), pad("suggest", 8), pad("current", 8), "diff");
  for (const r of rows.sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id))) {
    const diff = r.current !== "-" && r.current !== r.suggest ? "⚠" : "";
    console.log(pad(r.id, 20), pad(r.cat, 11), pad(r.hex, 9), pad(r.hsl, 12), pad(r.light, 8), pad(r.temp, 8), pad(r.suggest, 8), pad(r.current, 8), diff);
  }
  const diffs = rows.filter((r) => r.current !== "-" && r.current !== r.suggest);
  console.log(`\nTotal ${rows.length} · lệch tone chấm tay vs đo: ${diffs.length}`);
  console.log("wrote src/ai/data/material-colors.json");
}
main();
