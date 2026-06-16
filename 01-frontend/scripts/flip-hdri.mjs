/**
 * flip-hdri — vertical-flip fix for public/hdri/studio.hdr.
 *
 * The original studio.exr → studio.hdr conversion (scripts/convert-hdri.mjs)
 * wrote scanlines in EXRLoader row order but the asset reads back upside-down
 * through three's HDRLoader. With DataTextures, texture.flipY is ignored at GPU
 * upload (UNPACK_FLIP_Y_WEBGL does not apply to ArrayBufferView), so the only
 * reliable fix is to flip the pixel rows in the file itself.
 *
 * Decodes studio.hdr with HDRLoader, reverses the scanline order, and re-encodes
 * to RLE RGBE. The half→RGBE re-quantization is negligible for an ambient-only
 * reflection map. The source .exr is gone, so we operate on the .hdr in place.
 *
 * Run once: `node scripts/flip-hdri.mjs`. Not part of the build.
 */
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "public/hdri/studio.hdr";

// --- half-float → float -----------------------------------------------------
function halfToFloat(h) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 0x1f) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

// --- float → RGBE (Ward) ----------------------------------------------------
function frexp(value) {
    if (value === 0 || !isFinite(value)) return [value, 0];
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, value);
    let bits = (dv.getUint32(0) >>> 20) & 0x7ff;
    if (bits === 0) {
        dv.setFloat64(0, value * Math.pow(2, 64));
        bits = ((dv.getUint32(0) >>> 20) & 0x7ff) - 64;
    }
    const exponent = bits - 1022;
    return [value / Math.pow(2, exponent), exponent];
}

function floatToRgbe(r, g, b, out, o) {
    const v = Math.max(r, g, b);
    if (v < 1e-32) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
        return;
    }
    const [m, e] = frexp(v); // m ∈ [0.5,1)
    const scale = (m * 256) / v;
    out[o] = Math.min(255, Math.floor(r * scale));
    out[o + 1] = Math.min(255, Math.floor(g * scale));
    out[o + 2] = Math.min(255, Math.floor(b * scale));
    out[o + 3] = e + 128;
}

// --- new-format adaptive RLE for one scanline component ----------------------
function rleComponent(bytes, out) {
    const n = bytes.length;
    let cur = 0;
    while (cur < n) {
        let run = 1;
        while (cur + run < n && run < 127 && bytes[cur + run] === bytes[cur]) run++;
        if (run >= 4) {
            out.push(128 + run, bytes[cur]);
            cur += run;
        } else {
            const lit = [];
            while (cur < n && lit.length < 128) {
                let r = 1;
                while (cur + r < n && r < 4 && bytes[cur + r] === bytes[cur]) r++;
                if (r >= 4) break;
                lit.push(bytes[cur]);
                cur++;
            }
            out.push(lit.length, ...lit);
        }
    }
}

// --- decode existing .hdr ---------------------------------------------------
const buf = readFileSync(FILE);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const tex = new HDRLoader().parse(ab);
const w = tex.width;
const h = tex.height;
const d = tex.data; // HDRLoader → HalfFloatType (Uint16Array), RGBA
const isHalf = d.constructor.name === "Uint16Array";
const f = (i) => (isHalf ? halfToFloat(d[i]) : d[i]);

// --- encode RGBE scanlines, reading rows BOTTOM→TOP (vertical flip) ----------
const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`;
const body = [];
const rowR = new Uint8Array(w);
const rowG = new Uint8Array(w);
const rowB = new Uint8Array(w);
const rowE = new Uint8Array(w);
const rgbe = new Uint8Array(4);
for (let y = 0; y < h; y++) {
    const sy = h - 1 - y; // <-- the flip
    for (let x = 0; x < w; x++) {
        const si = (sy * w + x) * 4; // RGBA
        floatToRgbe(f(si), f(si + 1), f(si + 2), rgbe, 0);
        rowR[x] = rgbe[0];
        rowG[x] = rgbe[1];
        rowB[x] = rgbe[2];
        rowE[x] = rgbe[3];
    }
    body.push(2, 2, (w >> 8) & 0xff, w & 0xff);
    rleComponent(rowR, body);
    rleComponent(rowG, body);
    rleComponent(rowB, body);
    rleComponent(rowE, body);
}

const out = Buffer.concat([Buffer.from(header, "ascii"), Buffer.from(body)]);
writeFileSync(FILE, out);
console.log(`flipped ${FILE} (${w}×${h}) — ${(out.length / 1e6).toFixed(2)} MB`);
