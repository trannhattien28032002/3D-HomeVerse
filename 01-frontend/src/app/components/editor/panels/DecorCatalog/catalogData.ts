import objectsData from "src/data/catalog/objects.json";

export type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  thumbnailUrl?: string;
  modelUrl?: string;
  wallConstrained?: boolean;
};

function isCatalogEntry(o: unknown): o is CatalogEntry {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.category === "string"
  );
}

export const ALL_CATEGORIES = "All";

/**
 * File JSON nguồn chứa một entry rỗng `{}` bị lỗi, nên ta xác thực từng
 * bản ghi và loại bỏ những entry thiếu các trường bắt buộc.
 */
export const CATALOG_ENTRIES: CatalogEntry[] = (
  (objectsData as { objects?: unknown[] }).objects ?? []
).filter(isCatalogEntry).map((entry) => {
  const raw = entry as unknown as Record<string, unknown>;
  const placement = raw.placement as Record<string, unknown> | undefined;
  return { ...entry, wallConstrained: placement?.constraint === "wall" };
});

/** Danh sách chip suy ra: "All" + các danh mục duy nhất có trong JSON. */
export const FILTER_CHIPS: string[] = [
  ALL_CATEGORIES,
  ...Array.from(new Set(CATALOG_ENTRIES.map((e) => e.category))).sort(),
];

/** Chuyển slug danh mục như "bed-frame" thành nhãn hiển thị "Bed Frame". */
export function labelize(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Lọc các entry trong catalog theo từ khóa tìm kiếm và danh mục đang chọn. */
export function filterCatalog(
  entries: CatalogEntry[],
  search: string,
  activeCategory: string,
): CatalogEntry[] {
  return entries.filter((obj) => {
    const matchesSearch = obj.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === ALL_CATEGORIES || obj.category === activeCategory;
    return matchesSearch && matchesCategory;
  });
}
