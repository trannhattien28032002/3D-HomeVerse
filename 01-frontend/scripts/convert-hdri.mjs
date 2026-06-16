/**
 * convert-hdri — one-shot asset converter for HG-04.
 *
 * Reads public/hdri/studio.exr (2048×1024 HalfFloat RGBA, uncompressed ~3.4 MB),
 * box-downsamples to 1024×512 (plenty for ambient reflection only) and writes an
 * RLE-compressed Radiance .hdr (RGBE). The .hdr is read back with three's HDRLoader
 * to assert the round-trip is sane before we trust it.
 *
 * Run once: `node scripts/convert-hdri.mjs`. Not part of the build.
 */
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "public/hdri/studio.exr";
const DST = "public/hdri/studio.hdr";
const DOWNSCALE = 2; // 2048×1024 → 1024×512

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
        // count an identical run at cur (cap 127)
        let run = 1;
        while (cur + run < n && run < 127 && bytes[cur + run] === bytes[cur]) run++;
        if (run >= 4) {
            out.push(128 + run, bytes[cur]);
            cur += run;
        } else {
            // literal block until a >=4 run begins, cap 128
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

// --- read + downsample EXR --------------------------------------------------
const buf = readFileSync(SRC);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const exr = new EXRLoader().parse(ab);
const sw = exr.width;
const sh = exr.height;
const half = exr.data; // Uint16Array RGBA half
const dw = sw / DOWNSCALE;
const dh = sh / DOWNSCALE;
if (!Number.isInteger(dw) || !Number.isInteger(dh)) throw new Error("non-integer downscale");

// linear-space box average of DOWNSCALE×DOWNSCALE blocks → float RGB per dst pixel
const dst = new Float32Array(dw * dh * 3);
const inv = 1 / (DOWNSCALE * DOWNSCALE);
for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
        let r = 0,
            g = 0,
            b = 0;
        for (let by = 0; by < DOWNSCALE; by++) {
            for (let bx = 0; bx < DOWNSCALE; bx++) {
                const si = ((y * DOWNSCALE + by) * sw + (x * DOWNSCALE + bx)) * 4;
                r += halfToFloat(half[si]);
                g += halfToFloat(half[si + 1]);
                b += halfToFloat(half[si + 2]);
            }
        }
        const di = (y * dw + x) * 3;
        dst[di] = r * inv;
        dst[di + 1] = g * inv;
        dst[di + 2] = b * inv;
    }
}

// --- encode RGBE scanlines (new-format RLE) ---------------------------------
const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${dh} +X ${dw}\n`;
const body = [];
const rowR = new Uint8Array(dw);
const rowG = new Uint8Array(dw);
const rowB = new Uint8Array(dw);
const rowE = new Uint8Array(dw);
const rgbe = new Uint8Array(4);
// EXRLoader gives data with flipY=false but HDRLoader reads back with flipY=true;
// with DataTextures flipY is ignored at GPU upload, so write rows bottom→top to
// keep the equirect right-side up (matches scripts/flip-hdri.mjs).
for (let y = 0; y < dh; y++) {
    const sy = dh - 1 - y;
    for (let x = 0; x < dw; x++) {
        const di = (sy * dw + x) * 3;
        floatToRgbe(dst[di], dst[di + 1], dst[di + 2], rgbe, 0);
        rowR[x] = rgbe[0];
        rowG[x] = rgbe[1];
        rowB[x] = rgbe[2];
        rowE[x] = rgbe[3];
    }
    // scanline header for new RLE: 2,2,width hi,width lo
    body.push(2, 2, (dw >> 8) & 0xff, dw & 0xff);
    rleComponent(rowR, body);
    rleComponent(rowG, body);
    rleComponent(rowB, body);
    rleComponent(rowE, body);
}

const headerBytes = Buffer.from(header, "ascii");
const out = Buffer.concat([headerBytes, Buffer.from(body)]);
writeFileSync(DST, out);

// --- verify round-trip ------------------------------------------------------
const back = new HDRLoader().parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
if (back.width !== dw || back.height !== dh) throw new Error("size mismatch on readback");

// compare mean luminance: downsampled source vs decoded .hdr
function meanLumSrc() {
    let s = 0;
    for (let i = 0; i < dw * dh; i++) {
        const di = i * 3;
        s += 0.2126 * dst[di] + 0.7152 * dst[di + 1] + 0.0722 * dst[di + 2];
    }
    return s / (dw * dh);
}
function meanLumBack() {
    const d = back.data; // HalfFloat or Float depending on three; HDRLoader → HalfFloatType
    const isHalf = d.constructor.name === "Uint16Array";
    let s = 0;
    for (let i = 0; i < dw * dh; i++) {
        const di = i * 4; // RGBA
        const r = isHalf ? halfToFloat(d[di]) : d[di];
        const g = isHalf ? halfToFloat(d[di + 1]) : d[di + 1];
        const b = isHalf ? halfToFloat(d[di + 2]) : d[di + 2];
        s += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return s / (dw * dh);
}
const a = meanLumSrc();
const c = meanLumBack();
const err = Math.abs(a - c) / a;
console.log(`src ${(buf.length / 1e6).toFixed(2)} MB → dst ${(out.length / 1e6).toFixed(2)} MB  (${dw}×${dh})`);
console.log(`mean luminance: src=${a.toFixed(4)} hdr=${c.toFixed(4)} relErr=${(err * 100).toFixed(2)}%`);
if (err > 0.02) throw new Error(`round-trip luminance error too high: ${(err * 100).toFixed(2)}%`);
console.log("OK — round-trip within tolerance");
