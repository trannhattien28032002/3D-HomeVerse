import objectsData from "src/data/catalog/objects.json";

export type TargetBBox = { width: number; depth: number; height: number };
export type CollisionBox = { width: number; depth: number; height?: number };

type JsonCatalogEntry = {
    id: string;
    name: string;
    category?: string;
    modelUrl?: string;
    boundingBox?: { width?: number; depth?: number; height?: number };
    collisionBox?: { width?: number; depth?: number; height?: number };
    topDown?: { imageUrl?: string };
};

/** Floor-plan footprint (XZ, metres). Always resolvable via the fallback chain below. */
export type Footprint2D = { width: number; depth: number };

/** Last-resort footprint when the catalog defines neither collisionBox nor boundingBox. */
const DEFAULT_FOOTPRINT: Footprint2D = { width: 0.8, depth: 0.8 };

function isValidEntry(o: unknown): o is JsonCatalogEntry {
    if (!o || typeof o !== "object") return false;
    const r = o as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.name === "string";
}

const catalogMap = new Map<string, JsonCatalogEntry>(
    ((objectsData as { objects?: unknown[] }).objects ?? [])
        .filter(isValidEntry)
        .map((o) => [o.id, o]),
);

export function getCatalogItem(modelId: string): JsonCatalogEntry | undefined {
    return catalogMap.get(modelId);
}

export function getAssetPath(modelId: string): string {
    const item = getCatalogItem(modelId);
    if (!item) throw new Error(`Unknown modelId: ${modelId}`);
    if (!item.modelUrl) throw new Error(`No modelUrl for: ${modelId}`);
    return item.modelUrl;
}

/** Returns expected bounding box from objects.json, or undefined if not defined. */
export function getBoundingBox(modelId: string): TargetBBox | undefined {
    const item = getCatalogItem(modelId);
    if (!item?.boundingBox) return undefined;
    const { width, depth, height } = item.boundingBox;
    if (width == null || depth == null || height == null) return undefined;
    return { width, depth, height };
}

/**
 * Returns the authored collision footprint (XZ only) from objects.json.
 * Falls back to boundingBox XZ if collisionBox is absent.
 */
export function getCollisionBox(modelId: string): CollisionBox | undefined {
    const item = getCatalogItem(modelId);
    const cb = item?.collisionBox;
    if (cb?.width != null && cb?.depth != null) {
        const result: CollisionBox = { width: cb.width, depth: cb.depth };
        if (cb.height != null && cb.height > 0) result.height = cb.height;
        return result;
    }
    const bb = item?.boundingBox;
    if (bb?.width != null && bb?.depth != null) return { width: bb.width, depth: bb.depth };
    return undefined;
}

/**
 * Returns the top-down 2D image URL from objects.json, or undefined if absent.
 * Used by the floor-plan view to render a furniture footprint image.
 */
export function getTopDownUrl(modelId: string): string | undefined {
    return getCatalogItem(modelId)?.topDown?.imageUrl;
}

/**
 * Resolves the 2D floor-plan footprint (XZ, metres):
 *   1. collisionBox / boundingBox (getCollisionBox)
 *   2. DEFAULT_FOOTPRINT (0.8 × 0.8)
 * Always returns a usable value so 2D rendering never has to guess.
 */
export function getFootprint2D(modelId: string): Footprint2D {
    const cb = getCollisionBox(modelId);
    if (cb) return { width: cb.width, depth: cb.depth };
    return DEFAULT_FOOTPRINT;
}
