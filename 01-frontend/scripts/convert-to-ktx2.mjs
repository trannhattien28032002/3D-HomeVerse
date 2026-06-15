#!/usr/bin/env node
/**
 * Convert material JPG textures → KTX2 (Basis Universal).
 *
 * Input:  public/materials/{Name}_1K-JPG/{Name}_1K-JPG_{Type}.jpg
 * Output: public/materials-ktx2/{Name}_1K-KTX2/{Name}_1K-KTX2_{Type}.ktx2
 *
 * Encoding strategy:
 *   Color         → UASTC  + sRGB transfer func  (highest quality, perceptual)
 *   NormalGL      → UASTC  + normal-map mode      (best for tangent-space normals)
 *   Roughness /   → ETC1S  + linear               (smaller file, single-channel ok)
 *   AO /
 *   Displacement
 *
 * NormalDX is skipped — Three.js uses OpenGL convention (NormalGL).
 *
 * Prerequisites:
 *   npm install --save-dev sharp
 * Run:
 *   node scripts/convert-to-ktx2.mjs
 */

import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import {
    readFileSync, writeFileSync, mkdirSync,
    existsSync, readdirSync, statSync,
} from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const MATS_DIR   = join(ROOT, 'public', 'materials');
const OUTPUT_DIR = join(ROOT, 'public', 'materials-ktx2');

// ----- imageDecoder required by ktx2-encoder in Node.js -----

async function imageDecoder(buffer) {
    const { data, info } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

// ----- Per-suffix encode options -----

function encodeOptions(suffix) {
    const base = { imageDecoder };

    if (suffix === 'Color') {
        return {
            ...base,
            isUASTC: true,
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
        };
    }
    if (suffix === 'NormalGL') {
        return {
            ...base,
            isUASTC: true,
            isNormalMap: true,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
        };
    }
    // Roughness | AmbientOcclusion | Displacement — ETC1S, linear
    return {
        ...base,
        isUASTC: false,
        isPerceptual: false,
        isSetKTX2SRGBTransferFunc: false,
        qualityLevel: 128,
        compressionLevel: 2,
    };
}

// Extract texture suffix from filename, e.g. "Fabric081A_1K-JPG_Color.jpg" → "Color"
function parseSuffix(filename) {
    const m = filename.match(/_([A-Za-z]+)\.jpg$/i);
    return m ? m[1] : null;
}

// ----- Process one material directory -----

async function convertDir(matDir) {
    const dirName = basename(matDir);
    if (!dirName.endsWith('_1K-JPG')) return 0; // skip non-standard dirs

    const outDirName = dirName.replace('_1K-JPG', '_1K-KTX2');
    const outDir     = join(OUTPUT_DIR, outDirName);
    mkdirSync(outDir, { recursive: true });

    const jpgFiles = readdirSync(matDir).filter(f => /\.jpg$/i.test(f));
    let count = 0;

    for (const file of jpgFiles) {
        const suffix = parseSuffix(file);
        if (!suffix || suffix === 'NormalDX') continue;

        const outFile = file
            .replace('_1K-JPG', '_1K-KTX2')
            .replace(/\.jpg$/i, '.ktx2');
        const outPath = join(outDir, outFile);

        if (existsSync(outPath)) {
            console.log(`  [skip] ${outFile}`);
            continue;
        }

        process.stdout.write(`  [enc]  ${file} → ${outFile} ... `);
        const buf  = new Uint8Array(readFileSync(join(matDir, file)));
        const ktx2 = await encodeToKTX2(buf, encodeOptions(suffix));
        writeFileSync(outPath, ktx2);
        console.log(`${(ktx2.length / 1024).toFixed(0)} KB`);
        count++;
    }

    return count;
}

// ----- Main -----

async function main() {
    console.log('Converting JPG materials → KTX2\n');

    const dirs = readdirSync(MATS_DIR)
        .filter(d => statSync(join(MATS_DIR, d)).isDirectory())
        .sort();

    let total = 0;
    for (const dir of dirs) {
        console.log(`[${dir}]`);
        total += await convertDir(join(MATS_DIR, dir));
    }

    console.log(`\nDone — ${total} new file(s) written.`);
}

main().catch(err => { console.error(err); process.exit(1); });
