/**
 * materialCatalog — adapter đọc materials.json cho Material Sidebar.
 *
 * Cung cấp danh sách material (id, name, category, icon) + hàm lọc theo
 * allowedCategories của slot, có map alias cho category không tồn tại trong
 * materials.json (quyết định: ceramic→tile+stone, glass→hiện tất cả).
 */
import materialsData from "src/data/catalog/materials.json";

export type MaterialItem = {
    id: string;
    name: string;
    category: string;
    icon: string;
};

type RawMaterials = {
    categories: { id: string; label: string }[];
    materials: MaterialItem[];
};

const data = materialsData as unknown as RawMaterials;

export const ALL_MATERIALS: MaterialItem[] = data.materials.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    icon: m.icon,
}));

const AVAILABLE_CATEGORIES = new Set(data.categories.map((c) => c.id));

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
    data.categories.map((c) => [c.id, c.label]),
);

/** Nhãn hiển thị của một category (fallback về id nếu thiếu). */
export function categoryLabel(id: string): string {
    return CATEGORY_LABELS[id] ?? id;
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
    const out = new Set<string>();
    for (const c of allowed) {
        const alias = CATEGORY_ALIAS[c];
        if (alias) {
            if (alias.length === 0) return null; // vd glass → hiện tất cả
            for (const a of alias) if (AVAILABLE_CATEGORIES.has(a)) out.add(a);
        } else if (AVAILABLE_CATEGORIES.has(c)) {
            out.add(c);
        }
    }
    return out.size > 0 ? out : null; // không khớp gì → hiện tất cả
}

/** Lọc material theo allowedCategories của một slot (đã map alias). */
export function materialsForSlot(allowedCategories: string[]): MaterialItem[] {
    const cats = resolveCategories(allowedCategories);
    if (!cats) return ALL_MATERIALS;
    return ALL_MATERIALS.filter((m) => cats.has(m.category));
}

/**
 * Preset category cho bề mặt procedural (không có materialSlots như đồ nội thất).
 *   - Tường: vữa/sơn, gạch, ốp, đá, gỗ, bê tông.
 *   - Sàn:   sàn gỗ, ốp, đá, bê tông, lát, nền.
 * Lọc xuống các category thật có trong materials.json để không hiện chip rỗng.
 */
export const WALL_CATEGORIES: string[] = ["plaster", "brick", "tile", "stone", "wood", "concrete"]
    .filter((c) => AVAILABLE_CATEGORIES.has(c));

export const FLOOR_CATEGORIES: string[] = ["woodfloor", "tile", "stone", "concrete", "paving", "ground"]
    .filter((c) => AVAILABLE_CATEGORIES.has(c));
