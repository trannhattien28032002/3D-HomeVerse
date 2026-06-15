/**
 * catalogSummary — liệt kê catalog gọn cho AI (WP1b, tiền đề WP2).
 *
 * Model cần biết modelId CÓ THẬT để gọi placeFurniture (guard sẽ reject id bịa).
 * WP2 sẽ thay bằng searchCatalog (fuzzy + tool). Ở WP1b ta nhúng danh sách tĩnh
 * này vào system prompt để model chọn đúng id.
 */
import objectsData from "src/data/catalog/objects.json";
import { getPlacement, getFootprint2D } from "src/engine/catalog/FurnitureCatalog";

export type CatalogEntry = {
    modelId: string;
    name: string;
    category: string;
    footprint: { width: number; depth: number };
    constraint: "floor" | "wall";
};

export function listCatalog(): CatalogEntry[] {
    const objs = (objectsData as { objects?: Array<{ id?: unknown; name?: unknown; category?: unknown }> }).objects ?? [];
    const out: CatalogEntry[] = [];
    for (const o of objs) {
        if (typeof o.id !== "string" || typeof o.name !== "string") continue;
        out.push({
            modelId: o.id,
            name: o.name,
            category: typeof o.category === "string" ? o.category : "",
            footprint: getFootprint2D(o.id),
            constraint: getPlacement(o.id).constraint,
        });
    }
    return out;
}

/** Chỉ đồ đặt SÀN — đầu vào cho placeFurniture (WP1). */
export function listPlaceableFurniture(): CatalogEntry[] {
    return listCatalog().filter((e) => e.constraint === "floor");
}

/** Danh sách category phân biệt (đã sort) — nhúng vào system prompt (WP2). */
export function listCategories(): string[] {
    return [...new Set(listCatalog().map((e) => e.category).filter(Boolean))].sort();
}
