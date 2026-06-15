import fs from 'fs';
import path from 'path';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const materialsDir = path.resolve('./public/materials');

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
    
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height
  };
};

async function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.toLowerCase().endsWith('.jpg') || entry.name.toLowerCase().endsWith('.png'))) {
      const ext = path.extname(entry.name);
      const ktx2Path = fullPath.replace(new RegExp(`${ext}$`, 'i'), '.ktx2');
      
      if (!fs.existsSync(ktx2Path)) {
        console.log(`Converting: ${fullPath} -> ${ktx2Path}`);
        try {
          const fileBuffer = fs.readFileSync(fullPath);
          const ktx2Buffer = await encodeToKTX2(fileBuffer, { imageDecoder });
          fs.writeFileSync(ktx2Path, ktx2Buffer);
          console.log(`Successfully converted: ${ktx2Path}`);
        } catch (error) {
          console.error(`Failed to convert ${fullPath}:`, error);
        }
      } else {
        console.log(`Skipping (already exists): ${ktx2Path}`);
      }
    }
  }
}

async function main() {
  const pattern = process.argv[2];
  if (pattern) {
    console.log(`Starting conversion for folders matching "${pattern}" in ${materialsDir}...`);
    const entries = fs.readdirSync(materialsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase().includes(pattern.toLowerCase())) {
        await processDirectory(path.join(materialsDir, entry.name));
      }
    }
  } else {
    console.log(`Starting conversion in ${materialsDir}...`);
    await processDirectory(materialsDir);
  }
  console.log('Conversion complete!');
}

main().catch(console.error);
