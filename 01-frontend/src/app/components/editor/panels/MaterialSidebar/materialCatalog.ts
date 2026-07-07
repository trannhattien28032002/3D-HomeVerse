/**
 * materialCatalog — adapter đọc catalogStore cho Material Sidebar.
 *
 * Cung cấp danh sách material (id, name, category, icon) + hàm lọc theo
 * allowedCategories của slot, có map alias cho category không tồn tại trong
 * catalog (quyết định: ceramic→tile+stone, glass→hiện tất cả).
 *
 * Dữ liệu lấy từ catalogStore (đã hydrate từ backend lúc bootstrap). Các giá trị
 * suy ra được memo theo catalogVersion để dựng lại sau khi hydrate.
 */
import { getMaterialsRaw, catalogVersion } from "src/shared/catalog/catalogStore";
import { resolveAssetUrl } from "src/shared/catalog/assetUrl";

export type MaterialItem = {
    id: string;
    name: string;
    category: string;
    icon: string;
};

// ── Cache suy ra từ catalogStore (dựng lại khi version đổi) ──────────────────
let cachedMaterials: MaterialItem[] | null = null;
let cachedCategories: Set<string> | null = null;
let cachedLabels: Record<string, string> | null = null;
let cachedVersion = -1;

function rebuild(): void {
    const v = catalogVersion();
    if (cachedMaterials && cachedCategories && cachedLabels && cachedVersion === v) return;
    const raw = getMaterialsRaw();
    cachedMaterials = raw.materials.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        icon: resolveAssetUrl(m.icon)!,
    }));
    cachedCategories = new Set(raw.categories.map((c) => c.id));
    cachedLabels = Object.fromEntries(raw.categories.map((c) => [c.id, c.label]));
    cachedVersion = v;
}

/** Toàn bộ material (đã resolve icon). Đọc từ catalogStore đã hydrate. */
export function getAllMaterials(): MaterialItem[] {
    rebuild();
    return cachedMaterials!;
}

/** Tập category slug thật sự có material. */
function availableCategories(): Set<string> {
    rebuild();
    return cachedCategories!;
}

/** Nhãn hiển thị của một category (fallback về id nếu thiếu). */
export function categoryLabel(id: string): string {
    rebuild();
    return cachedLabels![id] ?? id;
}

/** Các category xuất hiện trong `items`, giữ thứ tự xuất hiện đầu tiên. */
export function categoriesOf(items: MaterialItem[]): string[] {
    const seen: string[] = [];
    for (const m of items) if (!seen.includes(m.category)) seen.push(m.category);
    return seen;
}

/**
 * Map alias category của materialSlots → category thật trong materials.json.
 * Mảng rỗng = "không lọc" (hiện tất cả). Category không có ở đây giữ nguyên.
 */
const CATEGORY_ALIAS: Record<string, string[]> = {
    ceramic: ["tile", "stone"],
    glass: [],
};

/**
 * Giải allowedCategories của slot thành tập category thật để lọc.
 * Trả về `null` nghĩa là "hiện tất cả material" (slot không lọc được rõ ràng).
 */
function resolveCategories(allowed: string[]): Set<string> | null {
    const available = availableCategories();
    const out = new Set<string>();
    for (const c of allowed) {
        const alias = CATEGORY_ALIAS[c];
        if (alias) {
            if (alias.length === 0) return null; // vd glass → hiện tất cả
            for (const a of alias) if (available.has(a)) out.add(a);
        } else if (available.has(c)) {
            out.add(c);
        }
    }
    return out.size > 0 ? out : null; // không khớp gì → hiện tất cả
}

/** Lọc material theo allowedCategories của một slot (đã map alias). */
export function materialsForSlot(allowedCategories: string[]): MaterialItem[] {
    const cats = resolveCategories(allowedCategories);
    const all = getAllMaterials();
    if (!cats) return all;
    return all.filter((m) => cats.has(m.category));
}

/**
 * Preset category cho bề mặt procedural (không có materialSlots như đồ nội thất).
 *   - Tường: vữa/sơn, gạch, ốp, đá, gỗ, bê tông.
 *   - Sàn:   sàn gỗ, ốp, đá, bê tông, lát, nền.
 * Lọc xuống các category thật có trong catalog để không hiện chip rỗng.
 */
export function getWallCategories(): string[] {
    const available = availableCategories();
    return ["plaster", "brick", "tile", "stone", "wood", "concrete", "plastic"].filter((c) => available.has(c));
}

export function getFloorCategories(): string[] {
    const available = availableCategories();
    return ["woodfloor", "tile", "stone", "concrete", "paving", "ground"].filter((c) => available.has(c));
}
