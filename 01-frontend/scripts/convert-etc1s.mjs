#!/usr/bin/env node
/**
 * Convert material JPG textures → KTX2 (Basis Universal, ETC1S).
 *
 * Mục tiêu: NHẸ cả hai chiều — nhỏ trên đĩa (download) VÀ nhỏ trong VRAM.
 * ETC1S cho size nhỏ hơn UASTC nhiều, đánh đổi chất lượng color/normal hơi giảm.
 *
 * Input:  public/materials/{Name}_1K-JPG/{Name}_1K-JPG_{Type}.jpg
 * Output: public/materials/{Name}_1K-JPG/{Name}_1K-JPG_{Type}.ktx2  (cạnh JPG)
 *
 * Chỉ encode 4 map MaterialLibrary thật sự dùng: Color, NormalGL, Roughness,
 * AmbientOcclusion. NormalDX / Displacement / Metalness / icon → bỏ qua.
 *
 *   Color            → ETC1S + sRGB transfer + perceptual
 *   NormalGL         → ETC1S + normal-map mode + linear (chất lượng cao nhất)
 *   Roughness | AO   → ETC1S + linear
 *
 * Dùng:
 *   node scripts/convert-etc1s.mjs [filter]   # filter = lọc tên folder (vd "Concrete048")
 */

import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import {
    readFileSync, writeFileSync, existsSync, readdirSync, statSync,
} from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MATS_DIR  = join(__dirname, '..', 'public', 'materials');

// Map nào được encode (MaterialLibrary chỉ dùng 4 cái này).
const USED = new Set(['Color', 'NormalGL', 'Roughness', 'AmbientOcclusion']);

// Normal map của các material này bị ETC1S "sụp" thành phẳng (mất chi tiết) bất kể
// quality/mode → buộc dùng UASTC cho RIÊNG normal của chúng. To hơn nhưng đúng.
const NORMAL_NEEDS_UASTC = new Set([
    'Marble012', 'Metal049A', 'Metal055A', 'Metal063', 'Onyx015',
    'Plastic016A', 'Plastic017A', 'Travertine009', 'Wood094',
    'WoodFloor043', 'WoodFloor064', 'WoodFloor070',
]);

async function imageDecoder(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function encodeOptions(suffix, matId) {
    const base = { imageDecoder, isUASTC: false, compressionLevel: 4 };
    if (suffix === 'Color') {
        return { ...base, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, qualityLevel: 192 };
    }
    if (suffix === 'NormalGL') {
        // ETC1S sụp normal của một số material → fallback UASTC cho riêng chúng.
        if (NORMAL_NEEDS_UASTC.has(matId)) {
            return { imageDecoder, isUASTC: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false };
        }
        return { ...base, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, qualityLevel: 255 };
    }
    // Roughness | AmbientOcclusion — linear, single-channel ok với chất lượng vừa
    return { ...base, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, qualityLevel: 128 };
}

function parseSuffix(filename) {
    const m = filename.match(/_([A-Za-z]+)\.jpg$/i);
    return m ? m[1] : null;
}

async function convertDir(matDir) {
    const dirName = basename(matDir);
    if (!dirName.endsWith('_1K-JPG')) return { jpg: 0, ktx2: 0 };
    const matId = dirName.replace('_1K-JPG', '');

    let jpgBytes = 0, ktx2Bytes = 0;
    for (const file of readdirSync(matDir).filter(f => /\.jpg$/i.test(f))) {
        const suffix = parseSuffix(file);
        if (!suffix || !USED.has(suffix)) continue;

        const inPath  = join(matDir, file);
        const outPath = inPath.replace(/\.jpg$/i, '.ktx2');

        process.stdout.write(`  [enc] ${file} ... `);
        const buf  = new Uint8Array(readFileSync(inPath));
        const ktx2 = await encodeToKTX2(buf, encodeOptions(suffix, matId));
        writeFileSync(outPath, ktx2);

        const inKB = statSync(inPath).size / 1024, outKB = ktx2.length / 1024;
        jpgBytes += inKB; ktx2Bytes += outKB;
        console.log(`${inKB.toFixed(0)} KB jpg → ${outKB.toFixed(0)} KB ktx2`);
    }
    return { jpg: jpgBytes, ktx2: ktx2Bytes };
}

async function main() {
    const filter = process.argv[2];
    console.log(`ETC1S encode${filter ? ` (filter: "${filter}")` : ''}\n`);

    const dirs = readdirSync(MATS_DIR)
        .filter(d => statSync(join(MATS_DIR, d)).isDirectory())
        .filter(d => !filter || d.toLowerCase().includes(filter.toLowerCase()))
        .sort();

    let jpg = 0, ktx2 = 0;
    for (const dir of dirs) {
        console.log(`[${dir}]`);
        const r = await convertDir(join(MATS_DIR, dir));
        jpg += r.jpg; ktx2 += r.ktx2;
    }

    console.log(`\nTotal: ${(jpg / 1024).toFixed(1)} MB jpg → ${(ktx2 / 1024).toFixed(1)} MB ktx2 ` +
        `(${jpg > 0 ? ((1 - ktx2 / jpg) * 100).toFixed(0) : 0}% nhẹ hơn)`);
}

main().catch(err => { console.error(err); process.exit(1); });
