import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';

import { System } from '../ecs/System';
import { World }  from '../ecs/World';
import { Query }  from '../ecs/Query';

import { Transform }    from '../components/Transform';
import { ColliderAABB } from '../components/ColliderAABB';
import { StaticBody }   from '../components/StaticBody';
import { DynamicBody }  from '../components/DynamicBody';

// ─── Hằng số ──────────────────────────────────────────────────────────────────

/** Di chuyển tối thiểu (m) để kích hoạt rebuild OBB của static entity. */
const MOVE_THRESHOLD = 1e-4;

// ─── Module-level reuse cache (tránh GC) ──────────────────────────────────────

const _q      = new Quaternion();
const _euler  = new Euler();
const _mat4   = new Matrix4();
const _center = new Vector3();
const _half   = new Vector3();

// ─── Helper ────────────────────────────────────────────────────────────────────

/**
 * Ghi OBB từ Transform + ColliderAABB vào `out`.
 * Chỉ hỗ trợ rotation quanh trục Y (interior-design convention).
 */
function buildOBB(t: Transform, c: ColliderAABB, out: OBB): void {
    _center.set(t.x, t.y, t.z);
    _half.set(c.width, c.height, c.depth);

    _euler.set(0, t.rotY ?? 0, 0, 'YXZ');
    _q.setFromEuler(_euler);
    _mat4.makeRotationFromQuaternion(_q);

    out.center.copy(_center);
    out.halfSize.copy(_half);
    out.rotation.setFromMatrix4(_mat4);
}

/**
 * Xây OBB tại một vị trí tùy ý (không phụ thuộc Transform), dùng trong clampMovement.
 */
function buildOBBAt(
    posX: number, posY: number, posZ: number,
    rotY: number,
    c: ColliderAABB,
    out: OBB,
): void {
    _center.set(posX, posY, posZ);
    _half.set(c.width, c.height, c.depth);

    _euler.set(0, rotY, 0, 'YXZ');
    _q.setFromEuler(_euler);
    _mat4.makeRotationFromQuaternion(_q);

    out.center.copy(_center);
    out.halfSize.copy(_half);
    out.rotation.setFromMatrix4(_mat4);
}

// ─── Kiểu nội bộ ──────────────────────────────────────────────────────────────

interface CachedEntry {
    /**
     * Vị trí an toàn cuối cùng đã được xác nhận là KHÔNG overlap với bất kỳ static nào.
     * Đây là điểm "freeze" khi có collision.
     */
    safePos: Vector3;
    /** OBB được rebuild mỗi khi safePos thay đổi. */
    obb: OBB;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OBBCollisionSystem
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ## OBBCollisionSystem
 *
 * Hệ thống collision **thuần CPU / Three.js** — không cần WASM.
 * Sử dụng `OBB` (Oriented Bounding Box) từ `three/addons/math/OBB.js`.
 *
 * ### Chiến lược: "Last Safe Position" (Stop-on-Contact)
 *
 * ```
 *  Mỗi frame, với mỗi dynamic entity:
 *
 *  proposed = Transform hiện tại (đã bị drag / command thay đổi)
 *
 *  Nếu proposed KHÔNG overlap với bất kỳ static OBB nào:
 *      → chấp nhận: Transform giữ nguyên, safePos ← proposed
 *
 *  Nếu proposed CÓ overlap (va chạm):
 *      → từ chối: Transform ← safePos  (dừng lại tại vị trí an toàn cuối cùng)
 *      → safePos KHÔNG thay đổi
 * ```
 *
 * Đây là hành vi "dừng khi va chạm, không xuyên qua tường" — tương tự
 * `RapierCollisionSystem.cachedPos` nhưng không cần WASM.
 *
 * ### Ưu điểm
 * - Init ngay lập tức (không async, không WASM).
 * - Không có GC spikes (OBB reuse).
 * - O(D × S) — phù hợp interior-design scale (< 200 entities).
 *
 * ### Nhược điểm
 * - Không có CCD/sweep: nếu drag quá nhanh (> collider size / frame) có thể tunnel.
 *   Với drag tốc độ thấp (UI drag) điều này không xảy ra trong thực tế.
 * - Không có sliding: object DỪNG hoàn toàn khi chạm, không trượt theo tường.
 *   (Nếu cần sliding, dùng axis-separated resolution — xem comment trong resolveStop.)
 *
 * ### Public API
 * ```ts
 * const sys = new OBBCollisionSystem();
 * engine.addSystem(sys);
 *
 * // Trong Konva dragBoundFunc:
 * const safe = sys.clampMovement(world, entityId, tx, ty, tz);
 *
 * // Debug / Gizmo:
 * const obb = sys.getOBB(entityId);
 *
 * // Placement validation:
 * const ok = sys.intersects(world, entityA, entityB);
 * ```
 */
export class OBBCollisionSystem extends System {

    // ---------------------------------------------------------------------- //
    // State                                                                    //
    // ---------------------------------------------------------------------- //

    /** entityId → { safePos, obb } — cả static lẫn dynamic đều được cache. */
    private cache = new Map<number, CachedEntry>();

    /** OBB tạm dùng cho dynamic entity trong hot loop — tránh alloc. */
    private _dynOBB = new OBB();

    // ---------------------------------------------------------------------- //
    // ECS System update                                                        //
    // ---------------------------------------------------------------------- //

    update(world: World): void {
        const staticEntities  = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody);
        const dynamicEntities = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);

        // 1. GC: xoá cache của entities đã bị destroy
        this.gcCache(staticEntities, dynamicEntities);

        // 2. Sync OBB static (walls, furniture đứng yên)
        for (const id of staticEntities) {
            this.syncStaticOBB(world, id);
        }

        // 3. Stop-on-contact cho dynamic entities
        for (const id of dynamicEntities) {
            const t = world.getComponent(id, Transform)!;
            const c = world.getComponent(id, ColliderAABB)!;

            // Khởi tạo safePos lần đầu tiên entity trở thành dynamic
            if (!this.cache.has(id)) {
                const obb = new OBB();
                buildOBB(t, c, obb);
                this.cache.set(id, {
                    safePos: new Vector3(t.x, t.y, t.z),
                    obb,
                });
            }

            const entry = this.cache.get(id)!;

            // Kiểm tra vị trí proposed (= Transform hiện tại sau drag)
            buildOBB(t, c, this._dynOBB);

            if (this.hasCollision(this._dynOBB, staticEntities, id)) {
                // ── Va chạm: freeze tại safePos ──────────────────────────────
                t.x = entry.safePos.x;
                t.y = entry.safePos.y;
                t.z = entry.safePos.z;
                // entry.obb và entry.safePos KHÔNG thay đổi
            } else {
                // ── Đường thông: chấp nhận vị trí mới ───────────────────────
                entry.safePos.set(t.x, t.y, t.z);
                buildOBB(t, c, entry.obb); // cập nhật cached OBB
            }
        }
    }

    // ---------------------------------------------------------------------- //
    // Public API                                                               //
    // ---------------------------------------------------------------------- //

    /**
     * Synchronous clamp — dùng trong `dragBoundFunc` của Konva / UI event handler.
     *
     * Kiểm tra vị trí `(targetX, targetY, targetZ)` có overlap không:
     * - Không overlap → trả về target (cho phép đến đó).
     * - Có overlap   → trả về `safePos` hiện tại (dừng lại).
     *
     * @returns Vector3 vị trí an toàn, hoặc `null` nếu entity chưa được cache.
     */
    public clampMovement(
        world:    World,
        entityId: number,
        targetX:  number,
        targetY:  number,
        targetZ:  number,
    ): Vector3 | null {
        const t = world.getComponent(entityId, Transform);
        const c = world.getComponent(entityId, ColliderAABB);
        if (!t || !c) return null;

        const entry = this.cache.get(entityId);

        // Xây OBB tại targetPos
        buildOBBAt(targetX, targetY, targetZ, t.rotY ?? 0, c, this._dynOBB);

        const staticEntities = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody);

        if (this.hasCollision(this._dynOBB, staticEntities, entityId)) {
            // Va chạm → trả về safePos (dừng lại)
            return entry
                ? entry.safePos.clone()
                : new Vector3(t.x, t.y, t.z);
        }

        // Đường thông → cho phép
        return new Vector3(targetX, targetY, targetZ);
    }

    /**
     * Trả về cached OBB của entity (dùng cho debug / Gizmo visualize).
     * Null nếu entity chưa được đăng ký.
     */
    public getOBB(entityId: number): OBB | null {
        return this.cache.get(entityId)?.obb ?? null;
    }

    /**
     * Kiểm tra hai entity có đang overlap nhau không.
     * Dùng cho placement validation, snap check, v.v.
     */
    public intersects(
        world:   World,
        entityA: number,
        entityB: number,
    ): boolean {
        const tA = world.getComponent(entityA, Transform);
        const cA = world.getComponent(entityA, ColliderAABB);
        const tB = world.getComponent(entityB, Transform);
        const cB = world.getComponent(entityB, ColliderAABB);
        if (!tA || !cA || !tB || !cB) return false;

        const obbA = new OBB();
        const obbB = new OBB();
        buildOBB(tA, cA, obbA);
        buildOBB(tB, cB, obbB);
        return obbA.intersectsOBB(obbB);
    }

    // ---------------------------------------------------------------------- //
    // Private — Collision Detection                                            //
    // ---------------------------------------------------------------------- //

    /**
     * Kiểm tra `dynOBB` có overlap với bất kỳ static entity nào không.
     *
     * Trả về `true` ngay khi tìm thấy collision đầu tiên (early-exit).
     * `selfId` bị loại trừ (entity không va chạm với chính nó).
     */
    private hasCollision(
        dynOBB:         OBB,
        staticEntities: number[],
        selfId:         number,
    ): boolean {
        for (const sid of staticEntities) {
            if (sid === selfId) continue;
            const entry = this.cache.get(sid);
            if (!entry) continue;
            if (dynOBB.intersectsOBB(entry.obb)) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------------- //
    // Private — Cache Management                                               //
    // ---------------------------------------------------------------------- //

    /**
     * Sync OBB của static entity.
     * Chỉ rebuild OBB khi entity di chuyển > MOVE_THRESHOLD (tường bị kéo từ 2D).
     */
    private syncStaticOBB(world: World, id: number): void {
        const t = world.getComponent(id, Transform)!;
        const c = world.getComponent(id, ColliderAABB)!;

        if (!this.cache.has(id)) {
            const obb = new OBB();
            buildOBB(t, c, obb);
            this.cache.set(id, {
                safePos: new Vector3(t.x, t.y, t.z),
                obb,
            });
            return;
        }

        const entry = this.cache.get(id)!;
        const dx = t.x - entry.safePos.x;
        const dy = t.y - entry.safePos.y;
        const dz = t.z - entry.safePos.z;

        // Rebuild chỉ khi thực sự di chuyển
        if (
            Math.abs(dx) > MOVE_THRESHOLD ||
            Math.abs(dy) > MOVE_THRESHOLD ||
            Math.abs(dz) > MOVE_THRESHOLD
        ) {
            buildOBB(t, c, entry.obb);
            entry.safePos.set(t.x, t.y, t.z);
        }
    }

    /** Xoá cache của entities đã bị destroy khỏi World. */
    private gcCache(staticEntities: number[], dynamicEntities: number[]): void {
        const alive = new Set([...staticEntities, ...dynamicEntities]);
        for (const id of this.cache.keys()) {
            if (!alive.has(id)) this.cache.delete(id);
        }
    }
}
