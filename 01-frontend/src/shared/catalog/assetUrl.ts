/**
 * resolveAssetUrl — map path catalog (root-relative) sang URL CDN nếu được cấu hình.
 *
 * Content asset (GLB models, KTX2 textures, thumbnails, HDRI) khai báo trong
 * objects.json/materials.json dưới dạng path root-relative ("/models/...",
 * "/materials/...", "/thumbnails/...", "/hdri/..."). Helper này prefix base CDN
 * (VITE_ASSET_BASE_URL, vd Supabase Storage public bucket) vào path đó.
 *
 * - VITE_ASSET_BASE_URL rỗng/không set  → trả nguyên path (dev/fallback static public/).
 * - path đã absolute (http/https)        → giữ nguyên (vd thumbnail project từ storage).
 *
 * ⚠️ KHÔNG dùng cho decoder draco/basis (WASM runtime) — chúng cố ý giữ static.
 *
 * Đọc env mỗi lần gọi (chỉ là truy cập property) để test stub được qua vi.stubEnv.
 *
 * Sống ở `shared/` (không phải `data/`) vì `engine` (FurnitureCatalog, MaterialLibrary,
 * sceneSetup) cần hàm này để resolve path asset mà không được phép phụ thuộc `data/`
 * — xem BAO-CAO-REVIEW-DA-CHIEU.md #3/#7.
 */

/** Base CDN hiện tại, đã bỏ dấu "/" cuối. Rỗng = dùng asset tĩnh local. */
function assetBaseUrl(): string {
    const raw = import.meta.env.VITE_ASSET_BASE_URL ?? "";
    return raw.replace(/\/$/, "");
}

export function resolveAssetUrl(path: string | undefined): string | undefined {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path; // đã absolute → giữ nguyên
    const base = assetBaseUrl();
    if (!base) return path; // dev/fallback static
    return base + (path.startsWith("/") ? path : "/" + path);
}
