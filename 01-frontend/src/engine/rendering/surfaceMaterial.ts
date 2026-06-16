/**
 * surfaceMaterial — dựng material PBR cho bề mặt tường/sàn từ MaterialLibrary.
 *
 * Khác đồ nội thất (gán thẳng material library dùng chung): tường/sàn cần tiling
 * (RepeatWrapping) theo thang mét. Geometry tường (ExtrudeGeometry) và sàn
 * (ShapeGeometry) sinh UV ở thang mét world → set `repeat` đồng nhất là đủ.
 *
 * Phải CLONE material + texture (không mutate material library — đồ nội thất dùng
 * chung instance đó với repeat mặc định). Cache theo materialId để nhiều bề mặt
 * cùng material chia sẻ 1 instance (repeat đồng nhất nên an toàn).
 *
 * QUẢN LÝ VÒNG ĐỜI (C2) — refcount thay vì cache vĩnh viễn:
 *   Mỗi materialId trong cache giữ một bộ đếm `refs`. `buildSurfaceMaterial` (acquire)
 *   tăng refs và trả instance dùng chung; `releaseSurfaceMaterial` (gọi khi một mesh
 *   ĐỔI sang material khác) giảm refs và dispose material + 4 texture clone khi refs về 0.
 *
 *   Vì sao refcount mà không phải LRU theo số lượng: material trả về được gán THẲNG
 *   vào `mesh.material` của mesh đang sống và dùng chung giữa nhiều mesh. Evict theo
 *   recency có thể dispose một material vẫn đang hiển thị → bề mặt hỏng. Refcount chỉ
 *   dispose khi KHÔNG còn mesh nào trỏ tới (caller release đúng lúc reassignment) nên
 *   an toàn tuyệt đối với mesh đang sống, đồng thời thu hồi GPU memory khi user "lướt
 *   thử" nhiều material trên cùng một bề mặt.
 */
import * as THREE from "three";
import type { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";

/** Số lần lặp texture trên mỗi mét (UV tường/sàn ở thang mét). 0.5 ≈ 1 ô / 2m. */
const SURFACE_REPEAT = 0.5;

interface CacheEntry {
    mat: THREE.MeshStandardMaterial;
    refs: number;
}

/** materialId → entry (material clone + refcount). */
const cache = new Map<string, CacheEntry>();
/** Tra ngược instance → materialId để release theo material đọc từ mesh.material. */
const idByInstance = new WeakMap<THREE.Material, string>();

function cloneTiled(tex: THREE.Texture | null): THREE.Texture | null {
    if (!tex) return null;
    const c = tex.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(SURFACE_REPEAT, SURFACE_REPEAT);
    c.needsUpdate = true;
    return c;
}

function disposeEntry(entry: CacheEntry): void {
    const m = entry.mat;
    m.map?.dispose();
    m.normalMap?.dispose();
    m.roughnessMap?.dispose();
    m.aoMap?.dispose();
    m.dispose();
}

/**
 * Acquire material PBR (clone + tiled) cho bề mặt. Cache + refcount theo materialId:
 * mỗi lần gọi tăng refs. Caller PHẢI release material cũ khi gán material mới lên mesh
 * (xem releaseSurfaceMaterial). Null nếu materialId không tải được.
 */
export async function buildSurfaceMaterial(
    lib: MaterialLibrary,
    materialId: string,
): Promise<THREE.MeshStandardMaterial | null> {
    const hit = cache.get(materialId);
    if (hit) { hit.refs++; return hit.mat; }

    const base = await lib.loadMaterial(materialId);
    if (!base) return null;

    // Một acquire khác cho cùng id có thể đã build xong trong lúc await — tái dùng.
    const hit2 = cache.get(materialId);
    if (hit2) { hit2.refs++; return hit2.mat; }

    const mat = base.clone();
    mat.map = cloneTiled(base.map);
    mat.normalMap = cloneTiled(base.normalMap);
    mat.roughnessMap = cloneTiled(base.roughnessMap);
    mat.aoMap = cloneTiled(base.aoMap);
    mat.side = THREE.DoubleSide;
    mat.needsUpdate = true;

    cache.set(materialId, { mat, refs: 1 });
    idByInstance.set(mat, materialId);
    return mat;
}

/**
 * Release một (hoặc nhiều) material mà một mesh vừa NGỪNG dùng (gọi sau khi gán
 * material mới lên mesh). Bỏ qua an toàn mọi thứ không phải surface-material (vd
 * default material của MaterialRegistry, hay array group). Khi refs về 0 → dispose
 * material + texture clone và xoá khỏi cache.
 *
 * An toàn với gọi trùng/stale: nếu entry đã bị dispose hoặc instance không khớp
 * (đã bị thay), bỏ qua — không bao giờ dispose hai lần hay đẩy refs âm.
 */
export function releaseSurfaceMaterial(
    material: THREE.Material | THREE.Material[] | null | undefined,
): void {
    if (!material) return;
    const arr = Array.isArray(material) ? material : [material];
    for (const m of arr) {
        const id = idByInstance.get(m);
        if (id === undefined) continue;          // không phải surface-material
        const entry = cache.get(id);
        if (!entry || entry.mat !== m) continue; // đã evict / instance khác
        if (--entry.refs <= 0) {
            disposeEntry(entry);
            cache.delete(id);
            idByInstance.delete(m);
        }
    }
}

/** Dispose toàn bộ material/texture đã clone bất kể refcount. Gọi khi engine tắt. */
export function disposeSurfaceMaterials(): void {
    for (const entry of cache.values()) disposeEntry(entry);
    cache.clear();
}
