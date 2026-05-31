import objectsData from "src/data/catalog/objects.json";

export type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  thumbnailUrl?: string;
  modelUrl?: string;
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
 * The source JSON contains a malformed empty `{}` entry, so we validate each
 * record and drop anything missing required fields.
 */
export const CATALOG_ENTRIES: CatalogEntry[] = (
  (objectsData as { objects?: unknown[] }).objects ?? []
).filter(isCatalogEntry);

/** Derived chip list: "All" + unique categories present in the JSON. */
export const FILTER_CHIPS: string[] = [
  ALL_CATEGORIES,
  ...Array.from(new Set(CATALOG_ENTRIES.map((e) => e.category))).sort(),
];

/** Turn a category slug like "bed-frame" into a display label "Bed Frame". */
export function labelize(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Filter catalog entries by search query and active category. */
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
