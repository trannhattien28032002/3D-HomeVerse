/**
 * upload-catalog-assets.mjs — đẩy content asset từ public/ lên Supabase Storage.
 *
 * Upload public/{models,materials,thumbnails,hdri} vào bucket public
 * `catalog-assets` (migration 016), giữ NGUYÊN cấu trúc thư mục làm object key
 * (vd public/models/beds/bed-01.glb → key "models/beds/bed-01.glb"). URL public
 * khớp với resolveAssetUrl() ở FE (VITE_ASSET_BASE_URL).
 *
 * Idempotent: upsert=true nên chạy lại an toàn (dùng để re-sync khi thêm asset).
 * Cache 1 năm vì tên file ổn định — nếu THAY nội dung cùng tên, cân nhắc đổi tên
 * hoặc purge cache thủ công.
 *
 * Yêu cầu env (đặt trong 01-frontend/.env.local hoặc shell):
 *   VITE_SUPABASE_URL           — URL project Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   — service_role key (BYPASS RLS, KHÔNG commit)
 *
 * Chạy:
 *   cd 01-frontend
 *   node --env-file=.env.local scripts/upload-catalog-assets.mjs
 *   # tuỳ chọn: chỉ một số thư mục
 *   node --env-file=.env.local scripts/upload-catalog-assets.mjs models thumbnails
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const BUCKET = "catalog-assets";

// Thư mục content cần upload. draco/ và basis/ (decoder WASM) CỐ Ý giữ static.
const DEFAULT_DIRS = ["models", "materials", "thumbnails", "hdri"];

const CONTENT_TYPES = {
    ".glb": "model/gltf-binary",
    ".ktx2": "image/ktx2",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".hdr": "image/vnd.radiance",
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
        "✗ Thiếu VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "  Chạy: node --env-file=.env.local scripts/upload-catalog-assets.mjs",
    );
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Đảm bảo bucket public `catalog-assets` tồn tại (idempotent).
 * Tương đương migration 016 nhưng qua Storage API — dùng khi không có psql/CLI.
 * Bucket public → object phục vụ qua public endpoint, không cần RLS SELECT policy.
 */
async function ensureBucket() {
    const { data, error } = await supabase.storage.getBucket(BUCKET);
    if (data) {
        if (!data.public) {
            const { error: upErr } = await supabase.storage.updateBucket(BUCKET, { public: true });
            if (upErr) throw upErr;
            console.log(`• Bucket "${BUCKET}" đã chuyển sang public.`);
        } else {
            console.log(`• Bucket "${BUCKET}" đã tồn tại (public).`);
        }
        return;
    }
    // getBucket lỗi "not found" → tạo mới.
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (createErr) throw createErr;
    console.log(`• Đã tạo bucket public "${BUCKET}".`);
    void error;
}

/** Liệt kê đệ quy mọi file trong dir. */
function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

async function main() {
    const argDirs = process.argv.slice(2);
    const dirs = argDirs.length > 0 ? argDirs : DEFAULT_DIRS;

    const files = [];
    for (const d of dirs) {
        const abs = join(PUBLIC_DIR, d);
        try {
            if (statSync(abs).isDirectory()) walk(abs, files);
        } catch {
            console.warn(`⚠ Bỏ qua "${d}" (không tồn tại trong public/).`);
        }
    }

    if (files.length === 0) {
        console.error("✗ Không tìm thấy file nào để upload.");
        process.exit(1);
    }

    await ensureBucket();
    console.log(`Upload ${files.length} file lên bucket "${BUCKET}"…\n`);

    let ok = 0;
    const failed = [];
    for (const full of files) {
        // Key dùng dấu "/" (POSIX) bất kể OS — Storage không hiểu "\".
        const key = relative(PUBLIC_DIR, full).split(sep).join(posix.sep);
        const body = readFileSync(full);
        const contentType = CONTENT_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream";

        const { error } = await supabase.storage.from(BUCKET).upload(key, body, {
            upsert: true,
            cacheControl: "31536000",
            contentType,
        });

        if (error) {
            failed.push({ key, message: error.message });
            process.stdout.write("✗");
        } else {
            ok++;
            process.stdout.write(".");
        }
    }

    console.log(`\n\n✓ Thành công: ${ok}/${files.length}`);
    if (failed.length > 0) {
        console.log(`✗ Lỗi: ${failed.length}`);
        for (const f of failed) console.log(`   ${f.key} — ${f.message}`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
