import * as CANNON from 'cannon-es';
import { COLLISION_TYPES } from 'cannon-es';
import { Vector3 } from 'three';

import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Query } from '../ecs/Query';

import { Transform } from '../components/Transform';
import { ColliderAABB } from '../components/ColliderAABB';
import { StaticBody } from '../components/StaticBody';
import { DynamicBody } from '../components/DynamicBody';

// ─── Hằng số ──────────────────────────────────────────────────────────────────

/** Di chuyển tối thiểu (m) để rebuild body của static entity. */
const MOVE_THRESHOLD_SQ = 1e-8; // 0.1mm²

// ─── Reuse cache (tránh GC) ───────────────────────────────────────────────────

const _cannonPos = new CANNON.Vec3();
const _cannonQuat = new CANNON.Quaternion();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Chuyển rotY (radian) → CANNON.Quaternion quanh trục Y. */
function rotYToCannonQuat(rotY: number, out: CANNON.Quaternion): void {
    const half = (rotY ?? 0) / 2;
    out.set(0, Math.sin(half), 0, Math.cos(half));
}

// ─── Kiểu nội bộ ──────────────────────────────────────────────────────────────

interface StaticEntry {
    /** Body Cannon.js đại diện cho tường / vật tĩnh. */
    body: CANNON.Body;
    /** Vị trí đã sync lần cuối — để phát hiện khi tường bị kéo. */
    syncedPos: { x: number; y: number; z: number };
}

interface DynamicEntry {
    /**
     * Vị trí an toàn cuối cùng được xác nhận là collision-free.
     * Dùng để freeze object khi có va chạm ("stop-on-contact").
     */
    safePos: Vector3;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CannonCollisionSystem
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ## CannonCollisionSystem
 *
 * Hệ thống collision dùng **cannon-es** (JavaScript physics engine, không WASM).
 *
 * ### Tại sao cannon-es?
 * - Thuần JavaScript/TypeScript — không có WASM, không async init.
 * - `CANNON.World` cung cấp broadphase + narrowphase chính xác hơn AABB thuần tuý.
 * - Hỗ trợ `Box` shape với full orientation (3-axis rotation).
 * - Không panic như Rapier WASM với degenerate contacts.
 *
 * ### Chiến lược: "Last Safe Position" + Discrete Path Sweep (Anti-Tunneling)
 *
 * ```
 *  KHÔNG dùng world.step() — tránh gravity / velocity / integration.
 *  Chỉ dùng cannon-es như một spatial query engine:
 *
 *  Mỗi frame (hoặc mỗi dragMove event), với mỗi dynamic entity:
 *
 *    Bước 1 — Kiểm tra FINAL position:
 *      ├── overlap? → revert to safePos (đừng lại)
 *      └── không overlap → tiếp tục Bước 2
 *
 *    Bước 2 — Continuous Path Sweep (anti-tunneling):
 *      Chia đoạn safePos → proposed thành N bước dựa trên khoảng cách.
 *      Kiểm tra từng bước dọc theo đường:
 *      ├── Có overlap? → dùng Binary Search lui tới để tìm cực hạn an toàn → Dừng.
 *      └── Tất cả clear? → Đi đến đích, safePos ← đích.
 *
 *  Kết quả:
 *  - Cố kéo đi xuyên tường cực xa/nhanh cũng không lọt qua được (Anti-tunneling).
 *  - Object không bị giật lùi xa tường lúc chạm, nhờ tìm được chính xác tiếp điểm.
 *  - Trượt sát mép tường không bị cứng nhờ probe shape được shrink 2mm.
 * ```
 *
 * ### Cấu trúc Cannon World
 * ```
 *  CANNON.World (gravity = 0, broadphase = NaiveBroadphase)
 *    ├── Static bodies  (mass = 0)  ← tường, furniture đứng yên
 *    └── 1 Probe body  (mass = 0)  ← tạm thời để test overlap
 * ```
 *
 * ### Hạn chế
 * - Không có CCD liên tục: nếu drag > (min_wall_thickness × SWEEP_STEPS) một event
 *   thì có thể vẫn tunnel. Tăng SWEEP_STEPS nếu cần.
 * - Không có sliding: object dừng hẳn khi chạm (không trượt dọc tường).
 *
 * ### Sử dụng
 * ```ts
 * const sys = new CannonCollisionSystem();
 * engine.addSystem(sys);
 *
 * // Drag handler:
 * const safe = sys.clampMovement(world, entityId, tx, ty, tz);
 *
 * // Placement validation:
 * const ok = !sys.wouldCollide(world, entityId, tx, ty, tz);
 * ```
 */
export class CannonCollisionSystem extends System {

    // ---------------------------------------------------------------------- //
    // Cannon-es World                                                          //
    // ---------------------------------------------------------------------- //

    /**
     * Cannon world dùng làm spatial query engine.
     * KHÔNG bao giờ gọi `physicsWorld.step()` — chỉ dùng broadphase + narrowphase.
     */
    public readonly physicsWorld: CANNON.World;

    /** Body "thám tử" — đặt tại vị trí cần test, query overlap, xong xoá positions. */
    private probeBody: CANNON.Body;

    // ---------------------------------------------------------------------- //
    // ECS Cache                                                                //
    // ---------------------------------------------------------------------- //

    /** entityId → StaticEntry (cannon Body + syncedPos) */
    private staticEntries = new Map<number, StaticEntry>();

    /** entityId → DynamicEntry (safePos) */
    private dynamicEntries = new Map<number, DynamicEntry>();

    // ---------------------------------------------------------------------- //
    // Constructor                                                              //
    // ---------------------------------------------------------------------- //

    constructor() {
        super();

        // Không cần gravity — chỉ là spatial query engine
        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, 0, 0),
        });

        // NaiveBroadphase đủ tốt cho < 200 bodies (interior design scale)
        this.physicsWorld.broadphase = new CANNON.NaiveBroadphase();

        // Probe body: mass = 0, collider Box sẽ được resize trước mỗi query
        this.probeBody = new CANNON.Body({ mass: 0 });
        this.physicsWorld.addBody(this.probeBody);
    }

    // ---------------------------------------------------------------------- //
    // ECS System update                                                        //
    // ---------------------------------------------------------------------- //

    update(world: World): void {
        const staticEids = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody);
        const dynamicEids = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);

        // 1. GC: xoá entries / Cannon bodies của entities đã bị destroy
        this.gcStatic(staticEids);
        this.gcDynamic(dynamicEids);

        // 2. Sync static bodies (tường, furniture đứng yên)
        for (const id of staticEids) {
            this.syncStaticBody(world, id);
        }

        // 3. Continuous sweep (anti-tunneling + exact stop) cho dynamic entities
        for (const id of dynamicEids) {
            const t = world.getComponent(id, Transform)!;
            const c = world.getComponent(id, ColliderAABB)!;

            if (!this.dynamicEntries.has(id)) {
                this.dynamicEntries.set(id, {
                    safePos: new Vector3(t.x, t.y, t.z),
                });
            }
            const { safePos } = this.dynamicEntries.get(id)!;

            const rotY = t.rotY ?? 0;
            const dx = t.x - safePos.x;
            const dy = t.y - safePos.y;
            const dz = t.z - safePos.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq > 0) {
                const dist = Math.sqrt(distSq);
                const minExtent = Math.min(c.width, c.height, c.depth);
                // Step size không lớn hơn nửa bề dày nhỏ nhất (để không đi xuyên)
                const stepSize = Math.max(0.05, minExtent * 0.5);
                const steps = Math.min(100, Math.ceil(dist / stepSize));

                let lastValidX = safePos.x;
                let lastValidY = safePos.y;
                let lastValidZ = safePos.z;

                this.prepareProbe(c);

                for (let i = 1; i <= steps; i++) {
                    const frac = i / steps;
                    const testX = safePos.x + dx * frac;
                    const testY = safePos.y + dy * frac;
                    const testZ = safePos.z + dz * frac;

                    if (this.testOverlap(testX, testY, testZ, rotY, id)) {
                        // Binary search để tìm mép sát tường nhất
                        let t0 = (i - 1) / steps;
                        let t1 = frac;
                        for (let j = 0; j < 4; j++) {
                            const tm = (t0 + t1) / 2;
                            if (this.testOverlap(safePos.x + dx * tm, safePos.y + dy * tm, safePos.z + dz * tm, rotY, id)) {
                                t1 = tm; // hit, lùi lại
                            } else {
                                t0 = tm; // clear, tiến tới
                            }
                        }
                        lastValidX = safePos.x + dx * t0;
                        lastValidY = safePos.y + dy * t0;
                        lastValidZ = safePos.z + dz * t0;
                        break;
                    } else {
                        lastValidX = testX;
                        lastValidY = testY;
                        lastValidZ = testZ;
                    }
                }

                // Cập nhật vị trí bị chặn (hoặc đến đích an toàn)
                t.x = lastValidX;
                t.y = lastValidY;
                t.z = lastValidZ;
                safePos.set(lastValidX, lastValidY, lastValidZ);
            }
        }
    }

    // ---------------------------------------------------------------------- //
    // Public API                                                               //
    // ---------------------------------------------------------------------- //

    /**
     * Synchronous clamp — gọi trong `dragBoundFunc` của Konva.
     *
     * Kiểm tra cả **final position** lẫn **path** từ safePos → target
     * (anti-tunneling): nu dùng khéo đưa object qua tường thì vẫn bị chặn.
     *
     * @returns Vị trí an toàn (Vector3), hoặc `null` nếu entity không tồn tại.
     */
    public clampMovement(
        world: World,
        entityId: number,
        targetX: number,
        targetY: number,
        targetZ: number,
    ): Vector3 | null {
        const t = world.getComponent(entityId, Transform);
        const c = world.getComponent(entityId, ColliderAABB);
        if (!t || !c) return null;

        const entry = this.dynamicEntries.get(entityId);
        const rotY = t.rotY ?? 0;
        // Nếu entity chưa có safePos, dùng vị trí hiện tại
        const safeX = entry?.safePos.x ?? t.x;
        const safeY = entry?.safePos.y ?? t.y;
        const safeZ = entry?.safePos.z ?? t.z;

        const dx = targetX - safeX;
        const dy = targetY - safeY;
        const dz = targetZ - safeZ;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq === 0) return new Vector3(targetX, targetY, targetZ);

        const dist = Math.sqrt(distSq);
        const minExtent = Math.min(c.width, c.height, c.depth);
        const stepSize = Math.max(0.05, minExtent * 0.5);
        const steps = Math.min(100, Math.ceil(dist / stepSize));

        let lastValidX = safeX;
        let lastValidY = safeY;
        let lastValidZ = safeZ;

        this.prepareProbe(c);

        const initiallyOverlapping = this.testOverlap(safeX, safeY, safeZ, rotY, entityId);
        if (initiallyOverlapping) {
            // Escape hatch: Nếu vật thể đã bị lún/overlap từ đầu (do resize chèn vào nhau), 
            // bỏ qua va chạm để cho phép người dùng kéo vật thể thoát ra ngoài.
            return new Vector3(targetX, targetY, targetZ);
        }

        for (let i = 1; i <= steps; i++) {
            const frac = i / steps;
            const testX = safeX + dx * frac;
            const testY = safeY + dy * frac;
            const testZ = safeZ + dz * frac;

            if (this.testOverlap(testX, testY, testZ, rotY, entityId)) {
                let t0 = (i - 1) / steps;
                let t1 = frac;
                for (let j = 0; j < 4; j++) {
                    const tm = (t0 + t1) / 2;
                    if (this.testOverlap(safeX + dx * tm, safeY + dy * tm, safeZ + dz * tm, rotY, entityId)) {
                        t1 = tm;
                    } else {
                        t0 = tm;
                    }
                }
                lastValidX = safeX + dx * t0;
                lastValidY = safeY + dy * t0;
                lastValidZ = safeZ + dz * t0;
                break;
            } else {
                lastValidX = testX;
                lastValidY = testY;
                lastValidZ = testZ;
            }
        }

        return new Vector3(lastValidX, lastValidY, lastValidZ);
    }

    /**
     * Kiểm tra xem entity có bị overlap tại vị trí target không.
     * Dùng cho placement validation (đặt nội thất).
     */
    public wouldCollide(
        world: World,
        entityId: number,
        targetX: number,
        targetY: number,
        targetZ: number,
    ): boolean {
        const t = world.getComponent(entityId, Transform);
        const c = world.getComponent(entityId, ColliderAABB);
        if (!t || !c) return false;

        this.prepareProbe(c);
        return this.testOverlap(targetX, targetY, targetZ, t.rotY ?? 0, entityId);
    }

    /**
     * Kiểm tra xem hình hộp tùy chỉnh có va chạm tại vị trí target không.
     * Dùng cho boundBoxFunc khi Transform (xoay, kéo giãn).
     */
    public wouldCollideCustom(
        targetX: number,
        targetY: number,
        targetZ: number,
        width: number,
        depth: number,
        rotY: number,
        ignoreEntityId: number = -1
    ): boolean {
        const shrink = 0.002;
        const hw = Math.max(0.01, width / 2 - shrink);
        const hh = Math.max(0.01, 1 / 2 - shrink); // Wall height is fixed to 1
        const hd = Math.max(0.01, depth / 2 - shrink);

        if (this.probeBody.shapes.length === 0) {
            const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd));
            this.probeBody.addShape(shape);
        } else {
            const shape = this.probeBody.shapes[0] as CANNON.Box;
            shape.halfExtents.set(hw, hh, hd);
            shape.updateConvexPolyhedronRepresentation();
            shape.updateBoundingSphereRadius();
        }

        return this.testOverlap(targetX, targetY, targetZ, rotY, ignoreEntityId);
    }

    /**
     * Dispose: giải phóng tất cả Cannon bodies.
     * Gọi trong `engine.dispose()`.
     */
    public dispose(): void {
        for (const entry of this.staticEntries.values()) {
            this.physicsWorld.removeBody(entry.body);
        }
        this.physicsWorld.removeBody(this.probeBody);
        this.staticEntries.clear();
        this.dynamicEntries.clear();
    }

    // ---------------------------------------------------------------------- //
    // Private — Overlap Test                                                   //
    // ---------------------------------------------------------------------- //

    /**
     * Chuẩn bị (tái sử dụng) shape của probeBody trước khi quét.
     * Tránh việc cấp phát bộ nhớ (GC allocation) liên tục mỗi frame.
     */
    private prepareProbe(c: ColliderAABB): void {
        const shrink = 0.002;
        const hw = Math.max(0.01, c.width - shrink);
        const hh = Math.max(0.01, c.height - shrink);
        const hd = Math.max(0.01, c.depth - shrink);

        if (this.probeBody.shapes.length === 0) {
            const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd));
            this.probeBody.addShape(shape);
        } else {
            const shape = this.probeBody.shapes[0] as CANNON.Box;
            shape.halfExtents.set(hw, hh, hd);
            shape.updateConvexPolyhedronRepresentation();
            shape.updateBoundingSphereRadius();
        }
    }

    /**
     * Đặt `probeBody` tại (x, y, z, rotY) rồi hỏi Cannon broadphase
     * xem có overlap với bất kỳ static body nào không.
     *
     * Phải gọi `prepareProbe(c)` trước khi quét.
     */
    private testOverlap(
        x: number, y: number, z: number,
        rotY: number,
        ignoreEntityId: number = -1,
    ): boolean {
        // Đặt pose
        _cannonPos.set(x, y, z);
        rotYToCannonQuat(rotY, _cannonQuat);
        this.probeBody.position.copy(_cannonPos);
        this.probeBody.quaternion.copy(_cannonQuat);
        this.probeBody.updateBoundingRadius();
        this.probeBody.updateAABB();

        // 3. Tìm các cặp broadphase có thể overlap
        const bodies = this.physicsWorld.bodies;
        const n = bodies.length;
        const selfStaticEntry = ignoreEntityId !== -1 ? this.staticEntries.get(ignoreEntityId) : null;

        for (let i = 0; i < n; i++) {
            const other = bodies[i];
            if (other === this.probeBody) continue;

            // Bỏ qua xác (zombie shape) tĩnh của chính nó (đang bị kéo nhưng chưa kịp GC)
            if (selfStaticEntry && other === selfStaticEntry.body) continue;

            // Narrow-phase check: dùng CANNON.Narrowphase để test contact
            if (this.narrowTest(this.probeBody, other)) return true;
        }

        return false;
    }

    /**
     * Narrowphase test giữa hai bodies.
     *
     * Dùng `physicsWorld.narrowphase.boxBox(..., justTest=true)` — trả về `true`
     * ngay khi phát hiện overlap đầu tiên, KHÔNG alloc ContactEquation.
     *
     * `justTest` là cờ tối ưu của cannon-es để "chỉ kiểm tra, không tạo contact".
     */
    private narrowTest(bodyA: CANNON.Body, bodyB: CANNON.Body): boolean {
        // Broadphase AABB reject trước (rẻ nhất)
        if (!this.aabbOverlap(bodyA, bodyB)) return false;

        const np = this.physicsWorld.narrowphase;

        for (const si of bodyA.shapes) {
            for (const sj of bodyB.shapes) {
                // Xác định collision type để gọi đúng handler
                const type = (si.type | sj.type) as CANNON.CollisionType;

                let hit: boolean | void = false;

                switch (type) {
                    case COLLISION_TYPES.boxBox:
                        hit = np.boxBox(
                            si as CANNON.Box, sj as CANNON.Box,
                            bodyA.position, bodyB.position,
                            bodyA.quaternion, bodyB.quaternion,
                            bodyA, bodyB,
                            null, null,
                            true, // justTest — không alloc contact
                        );
                        break;

                    default:
                        // Fallback: dùng AABB overlap đã kiểm tra ở trên
                        // (cho interior design, shape luôn là Box)
                        hit = false;
                        break;
                }

                if (hit) return true;
            }
        }

        return false;
    }

    /**
     * AABB broadphase check (axis-aligned bounding box overlap).
     * Dùng để early-exit trước khi chạy narrowphase đắt tiền.
     */
    private aabbOverlap(a: CANNON.Body, b: CANNON.Body): boolean {
        const aabb1 = a.aabb;
        const aabb2 = b.aabb;
        return (
            aabb1.lowerBound.x <= aabb2.upperBound.x &&
            aabb1.upperBound.x >= aabb2.lowerBound.x &&
            aabb1.lowerBound.y <= aabb2.upperBound.y &&
            aabb1.upperBound.y >= aabb2.lowerBound.y &&
            aabb1.lowerBound.z <= aabb2.upperBound.z &&
            aabb1.upperBound.z >= aabb2.lowerBound.z
        );
    }

    // ---------------------------------------------------------------------- //
    // Private — Static Body Management                                         //
    // ---------------------------------------------------------------------- //

    /**
     * Tạo hoặc cập nhật Cannon body cho static entity.
     * Body có mass = 0 (static / kinematic trong Cannon).
     */
    private syncStaticBody(world: World, id: number): void {
        const t = world.getComponent(id, Transform)!;
        const c = world.getComponent(id, ColliderAABB)!;

        if (!this.staticEntries.has(id)) {
            // Tạo mới
            const shape = new CANNON.Box(
                new CANNON.Vec3(c.width, c.height, c.depth)
            );
            const body = new CANNON.Body({ mass: 0, shape });

            rotYToCannonQuat(t.rotY ?? 0, _cannonQuat);
            body.position.set(t.x, t.y, t.z);
            body.quaternion.copy(_cannonQuat);
            body.updateBoundingRadius();
            body.updateAABB();

            this.physicsWorld.addBody(body);
            this.staticEntries.set(id, {
                body,
                syncedPos: { x: t.x, y: t.y, z: t.z },
            });
            return;
        }

        // Kiểm tra entity có di chuyển không (tường bị kéo từ 2D plan)
        const entry = this.staticEntries.get(id)!;
        const sp = entry.syncedPos;

        // Tính delta position
        const dx = t.x - sp.x, dy = t.y - sp.y, dz = t.z - sp.z;

        // Phương pháp distance squared để check moved (Không xài Euclidean distance)
        if (dx * dx + dy * dy + dz * dz > MOVE_THRESHOLD_SQ) {
            // Sync position + rotation sang Cannon body
            rotYToCannonQuat(t.rotY ?? 0, _cannonQuat);
            entry.body.position.set(t.x, t.y, t.z);
            entry.body.quaternion.copy(_cannonQuat);
            entry.body.updateBoundingRadius();
            entry.body.updateAABB();

            sp.x = t.x; sp.y = t.y; sp.z = t.z;
        }
    }

    // ---------------------------------------------------------------------- //
    // Private — GC                                                             //
    // ---------------------------------------------------------------------- //

    private gcStatic(alive: number[]): void {
        const aliveSet = new Set(alive);
        for (const [id, entry] of this.staticEntries) {
            if (!aliveSet.has(id)) {
                this.physicsWorld.removeBody(entry.body);
                this.staticEntries.delete(id);
            }
        }
    }

    private gcDynamic(alive: number[]): void {
        const aliveSet = new Set(alive);
        for (const id of this.dynamicEntries.keys()) {
            if (!aliveSet.has(id)) this.dynamicEntries.delete(id);
        }
    }
}
