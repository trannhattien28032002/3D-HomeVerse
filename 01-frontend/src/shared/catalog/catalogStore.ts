/**
 * catalogStore — nguồn catalog metadata khả biến, hydrate một lần lúc bootstrap.
 *
 * Sống ở `shared/` (không phải `data/`) CÓ CHỦ ĐÍCH: đây là state thuần (object/
 * Map + getter đồng bộ), không tự fetch gì — việc fetch từ backend là của
 * `data/catalog/catalogApi.ts` (gọi `hydrateCatalog()` sau khi tải xong). Đặt ở
 * `shared` để `engine`/`ai` đọc catalog mà không phải phụ thuộc ngược vào `data`
 * (trước đây `engine/catalog/FurnitureCatalog.ts` v.v. import thẳng từ
 * `data/catalog/catalogStore` → vi phạm layering `shared ◄ engine ◄ ai ◄ app ► data`,
 * xem BAO-CAO-REVIEW-DA-CHIEU.md #3/#7).
 *
 * Rất nhiều getter catalog ĐỒNG BỘ rải khắp engine/AI (FurnitureCatalog,
 * MaterialLibrary, materialCatalog, catalogSummary) đọc từ store này — nhờ vậy
 * chữ ký của chúng vẫn đồng bộ, caller không phải đổi. `catalogVersion()` tăng mỗi
 * lần hydrate để các cache suy diễn (vd catalogMap) tự dựng lại.
 *
 * Unit test hydrate trực tiếp bằng fixture (xem src/test/setupCatalog.ts).
 */

/** Một entry object thô — đúng shape cũ của objects.json `.objects[]`. */
export type RawCatalogObject = {
    id: string;
    name: string;
    category?: string;
    thumbnailUrl?: string;
    modelUrl?: string;
    boundingBox?: { width?: number; depth?: number; height?: number };
    collisionBox?: { width?: number; depth?: number; height?: number };
    topDown?: { imageUrl?: string };
    placement?: Record<string, unknown>;
    materialSlots?: unknown[];
    materialBindings?: unknown[];
};

/** Một vật liệu thô — đúng shape cũ của materials.json `.materials[]`. */
export type RawMaterial = {
    id: string;
    name: string;
    category: string;
    icon: string;
    textures: { color?: string; normal?: string; roughness?: string; ao?: string };
};

/** Catalog vật liệu thô — đúng shape cũ của materials.json. */
export type RawMaterialCatalog = {
    categories: { id: string; label: string }[];
    materials: RawMaterial[];
};

let objects: RawCatalogObject[] = [];
let materials: RawMaterialCatalog = { categories: [], materials: [] };
let version = 0;

/** Nạp dữ liệu catalog mới và đánh dấu version tăng (kích các cache suy diễn dựng lại). */
export function hydrateCatalog(data: {
    objects: RawCatalogObject[];
    materials: RawMaterialCatalog;
}): void {
    objects = data.objects;
    materials = data.materials;
    version += 1;
}

/** Danh sách object thô hiện tại (rỗng nếu chưa hydrate). */
export function getObjectsRaw(): RawCatalogObject[] {
    return objects;
}

/** Catalog vật liệu thô hiện tại (rỗng nếu chưa hydrate). */
export function getMaterialsRaw(): RawMaterialCatalog {
    return materials;
}

/** Số lần đã hydrate — dùng làm khoá cache cho cấu trúc suy diễn (vd catalogMap). */
export function catalogVersion(): number {
    return version;
}

/** Đã hydrate ít nhất một lần chưa. */
export function isCatalogHydrated(): boolean {
    return version > 0;
}
