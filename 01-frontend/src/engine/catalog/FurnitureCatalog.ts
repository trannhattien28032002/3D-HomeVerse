/**
 * FurnitureCatalog — lớp truy cập catalog nội thất (objects.json).
 *
 * Nạp objects.json một lần thành Map theo modelId, rồi cung cấp các getter:
 *   - getAssetPath  : đường dẫn file GLB để nạp model
 *   - getBoundingBox: hộp bao hiển thị (nếu catalog khai báo)
 *   - getCollisionBox/getFootprint2D: kích thước va chạm XZ (có chuỗi fallback)
 *   - getTopDownUrl : ảnh nhìn-từ-trên để vẽ trong khung 2D
 *
 * Mọi getter đều "an toàn": luôn có giá trị dùng được (DEFAULT_FOOTPRINT) để
 * lớp render 2D không bao giờ phải đoán mò.
 */
import objectsData from "src/data/catalog/objects.json";

export type TargetBBox = { width: number; depth: number; height: number };
export type CollisionBox = { width: number; depth: number; height?: number };

type JsonPlacement = {
    constraint?: string;
    wallBehavior?: string;
    mountHeight?: number;
    faceGap?: number;
    cut?: { width?: number; height?: number; sill?: number };
};

/**
 * Một "component" đổi material mà người dùng thấy trong Material Sidebar.
 * `allowedCategories` tham chiếu category của materials.json (đã map alias ở UI).
 */
export type MaterialSlot = {
    id: string;
    label: string;
    allowedCategories: string[];
};

/**
 * Ánh xạ vật liệu gốc trong GLB → slot. Khóa nhận diện sub-mesh là `materialName`
 * (= tên material trong file GLB, vd "Bathtub"/"Drain"/"Tap"). `meshName` chỉ để
 * tham khảo/đọc; runtime khớp theo materialName vì 1 mesh GLB nhiều primitive bị
 * GLTFLoader tách thành nhiều Mesh con, mỗi cái giữ material.name riêng.
 */
export type MaterialBinding = {
    meshName: string;
    materialName: string;
    slotId: string;
};

type JsonCatalogEntry = {
    id: string;
    name: string;
    category?: string;
    /** Ảnh thumbnail catalog (dùng cho preview ở Material Sidebar / DecorCatalog). */
    thumbnailUrl?: string;
    modelUrl?: string;
    boundingBox?: { width?: number; depth?: number; height?: number };
    collisionBox?: { width?: number; depth?: number; height?: number };
    topDown?: { imageUrl?: string };
    placement?: JsonPlacement;
    materialSlots?: MaterialSlot[];
    materialBindings?: MaterialBinding[];
};

/**
 * Ràng buộc đặt đã giải (luôn có giá trị dùng được).
 *   - constraint "floor": chỉ trượt trên sàn (mặc định khi catalog không khai báo).
 *   - constraint "wall" : bám tường; `behavior` = "mount" (treo) | "opening" (khoét).
 *     mountHeight/faceGap dùng cho "mount"; cut (lỗ khoét) dùng cho "opening" —
 *     `cut` chỉ là override; lúc spawn ưu tiên đo kích thước thật từ model.
 */
export type PlacementSpec = {
    constraint: ConstraintKind;
    behavior?: WallBehavior;
    mountHeight: number;
    faceGap: number;
    cut?: { width?: number; height?: number; sill?: number };
};

export type ConstraintKind = "floor" | "wall";
export type WallBehavior = "mount" | "opening";

const DEFAULT_MOUNT_HEIGHT = 1.2;

/** Footprint mặt bằng (XZ, mét). Luôn giải được qua chuỗi fallback bên dưới. */
export type Footprint2D = { width: number; depth: number };

/** Footprint cuối cùng khi catalog không khai báo cả collisionBox lẫn boundingBox. */
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

/** Trả về bounding box kỳ vọng từ objects.json, hoặc undefined nếu không khai báo. */
export function getBoundingBox(modelId: string): TargetBBox | undefined {
    const item = getCatalogItem(modelId);
    if (!item?.boundingBox) return undefined;
    const { width, depth, height } = item.boundingBox;
    if (width == null || depth == null || height == null) return undefined;
    return { width, depth, height };
}

/**
 * Trả về footprint va chạm (chỉ XZ) do designer khai báo trong objects.json.
 * Nếu thiếu collisionBox thì fallback sang XZ của boundingBox.
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
 * Trả về URL ảnh 2D nhìn-từ-trên từ objects.json, hoặc undefined nếu không có.
 * Khung nhìn mặt bằng dùng để vẽ ảnh footprint của nội thất.
 */
export function getTopDownUrl(modelId: string): string | undefined {
    return getCatalogItem(modelId)?.topDown?.imageUrl;
}

/**
 * Giải ràng buộc đặt của một model. Luôn trả về giá trị dùng được:
 * mặc định "floor" khi catalog không khai báo `placement` (hoặc khai báo không hợp lệ),
 * nên mọi item cũ giữ nguyên hành vi đặt-trên-sàn.
 */
export function getPlacement(modelId: string): PlacementSpec {
    const p = getCatalogItem(modelId)?.placement;
    if (!p || p.constraint !== "wall") {
        return { constraint: "floor", mountHeight: DEFAULT_MOUNT_HEIGHT, faceGap: 0 };
    }
    const behavior: WallBehavior = p.wallBehavior === "opening" ? "opening" : "mount";
    return {
        constraint: "wall",
        behavior,
        mountHeight: p.mountHeight ?? DEFAULT_MOUNT_HEIGHT,
        faceGap: p.faceGap ?? 0,
        cut: p.cut,
    };
}

/**
 * Danh sách component đổi material của một model (rỗng nếu catalog không khai báo).
 * Material Sidebar dùng để render "Part Selection".
 */
export function getMaterialSlots(modelId: string): MaterialSlot[] {
    return getCatalogItem(modelId)?.materialSlots ?? [];
}

/**
 * Ánh xạ material gốc GLB → slot (rỗng nếu không khai báo). Handler áp material
 * dùng để biết sub-mesh nào (theo material.name) thuộc về slot nào.
 */
export function getMaterialBindings(modelId: string): MaterialBinding[] {
    return getCatalogItem(modelId)?.materialBindings ?? [];
}

/**
 * Giải footprint mặt bằng 2D (XZ, mét) theo thứ tự:
 *   1. collisionBox / boundingBox (getCollisionBox)
 *   2. DEFAULT_FOOTPRINT (0.8 × 0.8)
 * Luôn trả về giá trị dùng được để render 2D không phải đoán.
 */
export function getFootprint2D(modelId: string): Footprint2D {
    const cb = getCollisionBox(modelId);
    if (cb) return { width: cb.width, depth: cb.depth };
    return DEFAULT_FOOTPRINT;
}
