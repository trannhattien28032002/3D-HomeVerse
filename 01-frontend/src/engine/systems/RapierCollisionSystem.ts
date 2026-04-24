import RAPIER from "@dimforge/rapier3d-compat";
import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { Query } from "../ecs/Query";

import { Transform } from "../components/Transform";
import { ColliderAABB } from "../components/ColliderAABB";
import { StaticBody } from "../components/StaticBody";
import { DynamicBody } from "../components/DynamicBody";

const SWEEP_EPSILON = 2e-3;          // buffer gap before collision surface
const MOVE_THRESHOLD_SQ = 1e-6;     // minimum movement squared to trigger move (1mm²)

/**
 * RapierCollisionSystem
 *
 * === Chiến lược: pure spatial query — KHÔNG dùng step() ===
 *
 * Vì sao KHÔNG dùng step() + KinematicCharacterController:
 *   1. KCC + step() trigger nhiều code path trong Rapier WASM có thể
 *      panic (unreachable) do NaN, degenerate contacts, arena resize...
 *   2. Chúng ta không cần simulation — chỉ cần "có thể đến vị trí này không?"
 *
 * Giải pháp:
 *   - Static walls → Fixed RigidBody trong Rapier (collision proxy).
 *   - Dynamic wall (đang kéo) → KHÔNG tạo Rapier body. Dùng castShape
 *     thuần tuý để sweep AABB từ cachedPos → proposed position.
 *   - castShape dùng fresh RAPIER.Cuboid shape (không lưu collider.shape).
 *   - filterPredicate exclude non-fixed bodies.
 *   - cachedPos (JS Map) track "last safe position" — không bao giờ gọi
 *     body.translation() trên wrapper đã lưu qua frame.
 *
 * === Lưu ý WASM handle ===
 *   Lưu handle (number) không phải object. Lấy fresh wrapper mỗi khi cần:
 *     const body = physicsWorld.getRigidBody(handle);
 */
export class RapierCollisionSystem extends System {
    public physicsWorld: RAPIER.World | null = null;
    private initialized = false;

    // Chỉ track Static bodies (Fixed Rapier bodies)
    private staticBodyHandle     = new Map<number, number>(); // entity → rigidbody handle
    private staticColliderHandle = new Map<number, number>(); // entity → collider handle

    /**
     * Last-safe-position cache cho dynamic entities.
     * Điểm xuất phát của mỗi castShape sweep.
     */
    private cachedPos = new Map<number, { x: number; y: number; z: number }>();

    constructor() {
        super();
        RAPIER.init().then(() => {
            // Không cần gravity — chỉ là spatial query engine
            this.physicsWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
            this.initialized  = true;
        });
    }

    // ------------------------------------------------------------------ //
    // ECS System update                                                    //
    // ------------------------------------------------------------------ //

    update(world: World): void {
        if (!this.initialized || !this.physicsWorld) return;

        const dynamicEntities = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);
        const staticEntities  = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody);

        // 1. GC static bodies không còn tồn tại
        const staticSet = new Set(staticEntities);
        for (const id of Array.from(this.staticBodyHandle.keys())) {
            if (!staticSet.has(id)) {
                const h    = this.staticBodyHandle.get(id)!;
                const body = this.physicsWorld.getRigidBody(h);
                if (body) this.physicsWorld.removeRigidBody(body);
                this.staticBodyHandle.delete(id);
                this.staticColliderHandle.delete(id);
            }
        }

        // 2. GC cachedPos của entities không còn dynamic
        const dynamicSet = new Set(dynamicEntities);
        for (const id of Array.from(this.cachedPos.keys())) {
            if (!dynamicSet.has(id)) this.cachedPos.delete(id);
        }

        // 3. Sync all static walls vào Rapier
        for (const id of staticEntities) {
            this.syncStaticBody(world, id);
        }

        // 4. Collision detection cho dynamic entities (castShape, KHÔNG step)
        for (const id of dynamicEntities) {
            const t = world.getComponent(id, Transform)!;
            const c = world.getComponent(id, ColliderAABB)!;

            // Khởi tạo cache nếu lần đầu kéo
            if (!this.cachedPos.has(id)) {
                this.cachedPos.set(id, { x: t.x, y: t.y, z: t.z });
            }
            const cached = this.cachedPos.get(id)!;

            this.resolveCollision(t, c, cached);
        }
    }

    // ------------------------------------------------------------------ //
    // Public API — dùng bởi engine.ts clampMovement2D                    //
    // ------------------------------------------------------------------ //

    /**
     * Synchronous query — dùng bởi Konva dragBoundFunc.
     * Tìm vị trí an toàn gần nhất cho entity khi kéo đến (targetX, targetY, targetZ).
     */
    public clampMovement(
        world: World,
        entityId: number,
        targetX: number,
        targetY: number,
        targetZ: number
    ): { x: number; y: number; z: number } | null {
        if (!this.initialized || !this.physicsWorld) return null;

        const c = world.getComponent(entityId, ColliderAABB);
        if (!c) return null;

        const cached = this.cachedPos.get(entityId);
        if (!cached) return null;

        const fakeTrans = { x: targetX, y: targetY, z: targetZ, rotY: 0 };
        const t = world.getComponent(entityId, Transform);
        if (t) fakeTrans.rotY = t.rotY;

        const dx  = targetX - cached.x;
        const dy  = targetY - cached.y;
        const dz  = targetZ - cached.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (len < Math.sqrt(MOVE_THRESHOLD_SQ)) {
            return { x: cached.x, y: cached.y, z: cached.z };
        }

        const rot   = this.rotYToQuat(fakeTrans.rotY);
        const shape = new RAPIER.Cuboid(c.width, c.height, c.depth);
        const hit   = this.physicsWorld.castShape(
            { x: cached.x, y: cached.y, z: cached.z },
            rot,
            { x: dx, y: dy, z: dz },
            shape,
            0.0, 1.0, true,
            undefined, undefined, undefined, undefined,
            (col) => this.isFixed(col)
        );

        if (hit != null && hit.time_of_impact < 1.0) {
            const toi = Math.max(0, hit.time_of_impact - SWEEP_EPSILON / len);
            return {
                x: cached.x + dx * toi,
                y: cached.y + dy * toi,
                z: cached.z + dz * toi,
            };
        }

        return { x: targetX, y: targetY, z: targetZ };
    }

    // ------------------------------------------------------------------ //
    // Private helpers                                                      //
    // ------------------------------------------------------------------ //

    /**
     * Sweep shape từ cachedPos → transform, clamp nếu hit.
     * Tất cả query dùng fresh RAPIER.Cuboid — không cần collider object.
     */
    private resolveCollision(
        t: Transform,
        c: ColliderAABB,
        cached: { x: number; y: number; z: number }
    ): void {
        const dx  = t.x - cached.x;
        const dy  = t.y - cached.y;
        const dz  = t.z - cached.z;
        const lenSq = dx * dx + dy * dy + dz * dz;

        if (lenSq < MOVE_THRESHOLD_SQ) {
            // Không di chuyển — giữ nguyên vị trí an toàn
            t.x = cached.x; t.y = cached.y; t.z = cached.z;
            return;
        }

        const len   = Math.sqrt(lenSq);
        const rot   = this.rotYToQuat(t.rotY);

        // Fresh shape mỗi frame — không có WASM memory aliasing issue
        const shape = new RAPIER.Cuboid(c.width, c.height, c.depth);

        const hit = this.physicsWorld!.castShape(
            { x: cached.x, y: cached.y, z: cached.z },
            rot,
            { x: dx, y: dy, z: dz },
            shape,
            0.0,    // targetDistance: start detect at distance 0
            1.0,    // maxToi: sweep full movement vector
            true,   // stopAtPenetration
            undefined, undefined, undefined, undefined,
            (col) => this.isFixed(col)  // chỉ va chạm với Fixed bodies (tường tĩnh)
        );

        if (hit != null && hit.time_of_impact < 1.0) {
            // Dừng trước tường một khoảng SWEEP_EPSILON
            const toi = Math.max(0, hit.time_of_impact - SWEEP_EPSILON / len);
            t.x = cached.x + dx * toi;
            t.y = cached.y + dy * toi;
            t.z = cached.z + dz * toi;
            // cachedPos KHÔNG update — entity bị chặn
        } else {
            // Đường thông — chấp nhận vị trí mới
            cached.x = t.x;
            cached.y = t.y;
            cached.z = t.z;
        }
    }

    /**
     * Tạo hoặc cập nhật Fixed body cho entity tĩnh.
     * Dùng cachedPos (JS) thay vì body.translation() để so sánh vị trí.
     */
    private syncStaticBody(world: World, id: number): void {
        const t = world.getComponent(id, Transform)!;
        const c = world.getComponent(id, ColliderAABB)!;
        const q = this.rotYToQuat(t.rotY);

        if (!this.staticBodyHandle.has(id)) {
            // Tạo Fixed body mới
            const desc = RAPIER.RigidBodyDesc.fixed();
            desc.setTranslation(t.x, t.y, t.z);
            desc.setRotation(q);

            const body     = this.physicsWorld!.createRigidBody(desc);
            const cDesc    = RAPIER.ColliderDesc.cuboid(c.width, c.height, c.depth);
            const collider = this.physicsWorld!.createCollider(cDesc, body);

            this.staticBodyHandle.set(id, body.handle);
            this.staticColliderHandle.set(id, collider.handle);
            // Lưu vị trí vào cachedPos để compare sau này
            this.cachedPos.set(id, { x: t.x, y: t.y, z: t.z });
        } else {
            // Kiểm tra xem tường có bị di chuyển không (từ 2D plan drag)
            const cached = this.cachedPos.get(id)!;
            const distSq = (t.x - cached.x) ** 2 + (t.y - cached.y) ** 2 + (t.z - cached.z) ** 2;

            if (distSq > MOVE_THRESHOLD_SQ) {
                const h    = this.staticBodyHandle.get(id)!;
                const body = this.physicsWorld!.getRigidBody(h); // FRESH wrapper
                if (body) {
                    body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
                    body.setRotation(q, true);
                    cached.x = t.x;
                    cached.y = t.y;
                    cached.z = t.z;
                }
            }
        }
    }

    /**
     * Kiểm tra collider có thuộc Fixed body không.
     * Dùng trong filterPredicate của castShape.
     * Lấy fresh RigidBody wrapper mỗi lần — an toàn trong synchronous call.
     */
    private isFixed(col: RAPIER.Collider): boolean {
        const parentHandle = col.parent()?.handle;
        if (parentHandle == null) return false;
        const body = this.physicsWorld!.getRigidBody(parentHandle);
        return body != null && body.isFixed();
    }

    private rotYToQuat(rotY: number): { x: number; y: number; z: number; w: number } {
        const half = (rotY ?? 0) / 2;
        return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
    }
}
