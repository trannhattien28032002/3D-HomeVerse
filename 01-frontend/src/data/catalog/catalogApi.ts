/**
 * catalogApi — nạp catalog metadata từ backend rồi hydrate {@link catalogStore}.
 *
 * Hợp đồng backend (đã có, sau requireAuth):
 *   GET /library/objects?limit=&cursor=&category= → { data: LibraryObjectDetail[], nextCursor }
 *   GET /materials?limit=&cursor=&category=        → { data: Material[], nextCursor }
 * URL asset (modelUrl/thumbnailUrl/iconUrl/textures) ĐÃ được backend resolve sang
 * CDN tuyệt đối (bucket catalog-assets), nên FE không cần resolveAssetUrl nữa
 * (resolveAssetUrl giữ pass-through cho URL absolute → an toàn nếu còn gọi).
 *
 * Backend phân trang (limit tối đa 100); ta lặp theo `nextCursor` để gom HẾT
 * (107 objects > 100 ⇒ cần >1 trang).
 */
import { apiFetch } from "src/data/api/client";
import {
    hydrateCatalog,
    isCatalogHydrated,
    type RawCatalogObject,
    type RawMaterial,
    type RawMaterialCatalog,
} from "src/shared/catalog/catalogStore";

// Trang lớn để gom toàn bộ catalog trong 1 request (objects ~107, materials ~63).
// Khớp giới hạn `max` của schema backend (xem library/materials.schema.ts).
const PAGE_LIMIT = 500;

// Cache catalog ở localStorage để lần mở editor sau hydrate TỨC THÌ (không chờ network),
// rồi revalidate ngầm. Bump version khi đổi shape map.
const CACHE_KEY = "homeverse:catalog:v1";

type CatalogSnapshot = { objects: RawCatalogObject[]; materials: RawMaterialCatalog };

/** Nhãn hiển thị cho category vật liệu (DB không lưu label — thuần presentation). */
const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
    concrete: "Concrete", brick: "Brick", tile: "Tile", wood: "Wood",
    woodfloor: "Wood Floor", stone: "Stone", fabric: "Fabric", metal: "Metal",
    plaster: "Plaster", paving: "Paving", ground: "Ground", grass: "Grass",
    plastic: "Plastic",
};

type ApiLibraryObject = {
    id: string;
    name: string;
    category: string;
    modelUrl: string;
    thumbnailUrl: string | null;
    topdownUrl: string | null;
    boundingBox?: Record<string, number> | null;
    collisionBox?: Record<string, number> | null;
    placement?: Record<string, unknown> | null;
    materialSlots?: unknown[] | null;
    materialBindings?: unknown[] | null;
};

type ApiMaterial = {
    id: string;
    name: string;
    category: string;
    iconUrl: string | null;
    textures?: { color?: string; normal?: string; roughness?: string; ao?: string } | null;
};

type Page<T> = { data: T[]; nextCursor: string | null };

/** Gom hết các trang của một endpoint phân trang theo cursor. */
async function fetchAllPages<T>(basePath: string): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | null = null;
    // Trần an toàn tránh vòng lặp vô hạn nếu backend trả cursor lỗi.
    for (let guard = 0; guard < 100; guard += 1) {
        const sep = basePath.includes("?") ? "&" : "?";
        const q: string = `${basePath}${sep}limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const page: Page<T> = await apiFetch<Page<T>>(q);
        all.push(...page.data);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return all;
}

/** Map row API (camelCase, URL đã resolve) → shape object thô của store. */
function toRawObject(o: ApiLibraryObject): RawCatalogObject {
    return {
        id: o.id,
        name: o.name,
        category: o.category,
        modelUrl: o.modelUrl,
        thumbnailUrl: o.thumbnailUrl ?? undefined,
        boundingBox: o.boundingBox ?? undefined,
        collisionBox: o.collisionBox ?? undefined,
        topDown: o.topdownUrl ? { imageUrl: o.topdownUrl } : undefined,
        placement: o.placement ?? undefined,
        materialSlots: o.materialSlots ?? undefined,
        materialBindings: o.materialBindings ?? undefined,
    };
}

/** Map row API vật liệu → shape vật liệu thô của store. */
function toRawMaterial(m: ApiMaterial): RawMaterial {
    return {
        id: m.id,
        name: m.name,
        category: m.category,
        icon: m.iconUrl ?? "",
        textures: m.textures ?? {},
    };
}

/** Dựng catalog vật liệu thô (gồm danh sách category + nhãn) từ các row đã map. */
function buildMaterialCatalog(materials: RawMaterial[]): RawMaterialCatalog {
    const seen: string[] = [];
    for (const m of materials) if (!seen.includes(m.category)) seen.push(m.category);
    const categories = seen.map((id) => ({ id, label: MATERIAL_CATEGORY_LABELS[id] ?? id }));
    return { categories, materials };
}

/** Nạp objects từ backend (đã gom hết trang) → shape store. */
export async function fetchAllObjects(): Promise<RawCatalogObject[]> {
    const rows = await fetchAllPages<ApiLibraryObject>("/library/objects");
    return rows.map(toRawObject);
}

/** Nạp materials từ backend (đã gom hết trang) → catalog vật liệu thô. */
export async function fetchAllMaterials(): Promise<RawMaterialCatalog> {
    const rows = await fetchAllPages<ApiMaterial>("/materials");
    return buildMaterialCatalog(rows.map(toRawMaterial));
}

/** Đọc snapshot catalog từ localStorage (null nếu chưa có / lỗi parse). */
function readCache(): CatalogSnapshot | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw) as CatalogSnapshot;
        if (!Array.isArray(snap.objects) || !snap.materials) return null;
        return snap;
    } catch {
        return null;
    }
}

function writeCache(snap: CatalogSnapshot): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
    } catch {
        /* quota/private mode → bỏ qua, chỉ mất cache */
    }
}

/**
 * Hydrate store từ cache localStorage NGAY (đồng bộ) nếu có. Trả true nếu hydrate được.
 * Dùng để editor mở tức thì ở các lần sau; revalidate ngầm qua hydrateCatalogFromApi.
 */
export function hydrateCatalogFromCache(): boolean {
    const snap = readCache();
    if (!snap) return false;
    hydrateCatalog(snap);
    return true;
}

// Dedupe các lời gọi đồng thời (vd React StrictMode mount 2 lần ở dev, hoặc nhiều
// component cùng bootstrap): chia sẻ MỘT promise đang chạy. Reset sau khi settle để
// lần mở editor sau vẫn revalidate được. Đây cũng là điểm mấu chốt fix "stuck loading
// lần đầu": mount-2 nhận lại đúng promise đang chạy nên `.then` của nó set được state.
let inflight: Promise<void> | null = null;

/**
 * Nạp song song cả 2 catalog từ backend, hydrate store và ghi cache.
 * Ném lỗi nếu fetch fail (caller quyết định: dùng cache nếu có, hoặc báo lỗi).
 */
export function hydrateCatalogFromApi(): Promise<void> {
    if (inflight) return inflight;
    inflight = (async () => {
        const [objects, materials] = await Promise.all([fetchAllObjects(), fetchAllMaterials()]);
        hydrateCatalog({ objects, materials });
        writeCache({ objects, materials });
    })();
    // Giải phóng khoá khi settle (thành/bại) để lần sau fetch mới được; nuốt rejection
    // ở nhánh dọn dẹp này để không thành unhandledRejection (caller vẫn nhận lỗi qua promise gốc).
    void inflight.finally(() => { inflight = null; }).catch(() => {});
    return inflight;
}

/** Đã có dữ liệu catalog dùng được chưa (store đã hydrate từ cache hoặc API). */
export function hasCatalog(): boolean {
    return isCatalogHydrated();
}
