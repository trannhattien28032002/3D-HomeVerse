/**
 * Upload frontend public assets → Supabase Storage bucket `assets` (P2 blocker #1).
 *
 *   npm run upload-assets
 *
 * Duyệt `01-frontend/public/{models,materials,thumbnails}` và upload từng file vào
 * bucket `assets`, GIỮ NGUYÊN cấu trúc thư mục nhưng BỎ slash đầu — key trong bucket
 * khớp với path catalog sau khi `resolvePublicUrl` strip slash (vd catalog
 * `/models/bathroom/bath-01.glb` → bucket key `models/bathroom/bath-01.glb`).
 *
 * Idempotent: upsert:true nên chạy lại chỉ ghi đè, không nhân bản. Bucket tạo dạng
 * PUBLIC vì URL phục vụ qua `/storage/v1/object/public/assets/...`.
 *
 * KHÔNG upload `topdown` (chưa có nguồn — bỏ theo quyết định). Chỉ gỡ blocker #1;
 * blocker #2 (FurnitureCatalog sync→async) làm sau.
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { storageAdmin } from '../configs/storage';

const PUBLIC_DIR = path.resolve(__dirname, '../../01-frontend/public');
const ASSET_DIRS = ['models', 'materials', 'thumbnails'];
const BUCKET = 'assets';
const CONCURRENCY = 8;

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ktx2': 'image/ktx2',
};

function contentType(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Recursively collect every file path under `dir`.
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

async function ensureBucket(): Promise<void> {
  const { data } = await storageAdmin.getBucket(BUCKET);
  if (data) {
    if (!data.public) {
      await storageAdmin.updateBucket(BUCKET, { public: true });
      console.log(`[upload] bucket "${BUCKET}" set to public.`);
    }
    return;
  }
  const { error } = await storageAdmin.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log(`[upload] created public bucket "${BUCKET}".`);
}

async function uploadOne(file: string): Promise<{ key: string; error: string | null }> {
  // Bucket key = path relative to public/, POSIX separators, no leading slash.
  const key = path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
  const buf = await readFile(file);
  const { error } = await storageAdmin
    .from(BUCKET)
    .upload(key, buf, { contentType: contentType(file), upsert: true });
  return { key, error: error?.message ?? null };
}

async function main(): Promise<void> {
  await ensureBucket();

  const files: string[] = [];
  for (const dir of ASSET_DIRS) {
    files.push(...(await walk(path.join(PUBLIC_DIR, dir))));
  }
  console.log(`[upload] ${files.length} files to upload → bucket "${BUCKET}".`);

  let ok = 0;
  const failures: string[] = [];

  // Simple fixed-size worker pool over a shared cursor.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const file = files[cursor++];
      const { key, error } = await uploadOne(file);
      if (error) {
        failures.push(`${key}: ${error}`);
      } else {
        ok++;
        if (ok % 50 === 0) process.stdout.write(`[upload] ${ok}/${files.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`[upload] Done. ${ok} ok, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error('[upload] Failures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[upload] FAILED:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
