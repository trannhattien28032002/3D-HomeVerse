import { getObjectsRaw, catalogVersion } from "src/shared/catalog/catalogStore";
import { resolveAssetUrl } from "src/shared/catalog/assetUrl";

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

// Cache suy ra từ catalogStore, dựng lại khi store hydrate (version đổi).
let cachedEntries: CatalogEntry[] | null = null;
let cachedChips: string[] | null = null;
let cachedVersion = -1;

function rebuild(): void {
  const v = catalogVersion();
  if (cachedEntries && cachedChips && cachedVersion === v) return;
  cachedEntries = getObjectsRaw()
    .filter(isCatalogEntry)
    .map((entry) => {
      const raw = entry as unknown as Record<string, unknown>;
      const placement = raw.placement as Record<string, unknown> | undefined;
      return {
        ...entry,
        thumbnailUrl: resolveAssetUrl(entry.thumbnailUrl),
        modelUrl: resolveAssetUrl(entry.modelUrl),
        wallConstrained: placement?.constraint === "wall",
      };
    });
  cachedChips = [
    ALL_CATEGORIES,
    ...Array.from(new Set(cachedEntries.map((e) => e.category))).sort(),
  ];
  cachedVersion = v;
}

/** Toàn bộ entry catalog (đã xác thực + resolve URL). Đọc từ catalogStore đã hydrate. */
export function getCatalogEntries(): CatalogEntry[] {
  rebuild();
  return cachedEntries!;
}

/** Danh sách chip lọc: "All" + các danh mục duy nhất hiện có. */
export function getFilterChips(): string[] {
  rebuild();
  return cachedChips!;
}

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
