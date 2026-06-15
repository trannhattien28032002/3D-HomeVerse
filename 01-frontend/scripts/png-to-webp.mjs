import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.png') out.push(full);
  }
  return out;
}

const files = walk(PUBLIC_DIR);
console.log(`Found ${files.length} PNG files\n`);

let pngBytes = 0;
let webpBytes = 0;
let ok = 0;
const failed = [];

for (const png of files) {
  const webp = png.replace(/\.png$/i, '.webp');
  try {
    const before = statSync(png).size;
    // quality 82 lossy, alpha preserved automatically, effort 6 for best ratio
    await sharp(png).webp({ quality: 82, effort: 6 }).toFile(webp);
    const after = statSync(webp).size;
    pngBytes += before;
    webpBytes += after;
    ok++;
    unlinkSync(png); // remove original after successful conversion
  } catch (err) {
    failed.push({ png, err: err.message });
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`Converted: ${ok}/${files.length}`);
console.log(`PNG total:  ${mb(pngBytes)} MB`);
console.log(`WebP total: ${mb(webpBytes)} MB`);
console.log(`Saved:      ${mb(pngBytes - webpBytes)} MB (${((1 - webpBytes / pngBytes) * 100).toFixed(1)}%)`);
if (failed.length) {
  console.log(`\nFAILED ${failed.length}:`);
  for (const f of failed) console.log(`  ${f.png}: ${f.err}`);
  process.exit(1);
}
