import * as CANNON from 'cannon-es';
import { COLLISION_TYPES } from 'cannon-es';
import { Vector3 } from 'three';

import { System } from 'src/engine/ecs/System';
import { World } from 'src/engine/ecs/World';
import { Query } from 'src/engine/ecs/Query';

import { Transform } from 'src/engine/components/Transform';
import { ColliderAABB } from 'src/engine/components/ColliderAABB';
import { StaticBody } from 'src/engine/components/StaticBody';
import { DynamicBody } from 'src/engine/components/DynamicBody';

const MOVE_THRESHOLD_SQ = 1e-8; // 0.1mm²
const _cannonPos = new CANNON.Vec3();
const _cannonQuat = new CANNON.Quaternion();

function rotYToCannonQuat(rotY: number, out: CANNON.Quaternion): void {
    const half = (rotY ?? 0) / 2;
    out.set(0, Math.sin(half), 0, Math.cos(half));
}

interface StaticEntry {
    body: CANNON.Body;
    syncedPos: { x: number; y: number; z: number };
    syncedRotY: number;
    syncedSize: { w: number; h: number; d: number };
}

interface DynamicEntry {
    safePos: Vector3;
}

export class CannonCollisionSystem extends System {
    public readonly physicsWorld: CANNON.World;
    private probeBody: CANNON.Body;
    private staticEntries = new Map<number, StaticEntry>();
    private dynamicEntries = new Map<number, DynamicEntry>();

    constructor() {
        super();

        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, 0, 0),
        });

        this.physicsWorld.broadphase = new CANNON.NaiveBroadphase();
        this.probeBody = new CANNON.Body({ mass: 0 });
        this.physicsWorld.addBody(this.probeBody);
    }

    update(world: World): void {
        const staticEids = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody);
        const dynamicEids = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);

        this.gcStatic(staticEids);
        this.gcDynamic(dynamicEids);

        for (const id of staticEids) {
            this.syncStaticBody(world, id);
        }

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
                        let t0 = (i - 1) / steps;
                        let t1 = frac;
                        for (let j = 0; j < 4; j++) {
                            const tm = (t0 + t1) / 2;
                            if (this.testOverlap(safePos.x + dx * tm, safePos.y + dy * tm, safePos.z + dz * tm, rotY, id)) {
                                t1 = tm;
                            } else {
                                t0 = tm;
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

                t.x = lastValidX;
                t.y = lastValidY;
                t.z = lastValidZ;
                safePos.set(lastValidX, lastValidY, lastValidZ);
            }
        }
    }

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
        const hh = Math.max(0.01, 1 / 2 - shrink);
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

    public dispose(): void {
        for (const entry of this.staticEntries.values()) {
            this.physicsWorld.removeBody(entry.body);
        }
        this.physicsWorld.removeBody(this.probeBody);
        this.staticEntries.clear();
        this.dynamicEntries.clear();
    }

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

    private testOverlap(
        x: number, y: number, z: number,
        rotY: number,
        ignoreEntityId: number = -1,
    ): boolean {
        _cannonPos.set(x, y, z);
        rotYToCannonQuat(rotY, _cannonQuat);
        this.probeBody.position.copy(_cannonPos);
        this.probeBody.quaternion.copy(_cannonQuat);
        this.probeBody.updateBoundingRadius();
        this.probeBody.updateAABB();

        const bodies = this.physicsWorld.bodies;
        const n = bodies.length;
        const selfStaticEntry = ignoreEntityId !== -1 ? this.staticEntries.get(ignoreEntityId) : null;

        for (let i = 0; i < n; i++) {
            const other = bodies[i];
            if (other === this.probeBody) continue;
            if (selfStaticEntry && other === selfStaticEntry.body) continue;
            if (this.narrowTest(this.probeBody, other)) return true;
        }

        return false;
    }

    private narrowTest(bodyA: CANNON.Body, bodyB: CANNON.Body): boolean {
        if (!this.aabbOverlap(bodyA, bodyB)) return false;

        const np = this.physicsWorld.narrowphase;

        for (const si of bodyA.shapes) {
            for (const sj of bodyB.shapes) {
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
                            true,
                        );
                        break;

                    default:
                        hit = false;
                        break;
                }

                if (hit) return true;
            }
        }

        return false;
    }

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
                syncedRotY: t.rotY ?? 0,
                syncedSize: { w: c.width, h: c.height, d: c.depth },
            });
            return;
        }

        const entry = this.staticEntries.get(id)!;
        const sp = entry.syncedPos;
        const ss = entry.syncedSize;
        const dx = t.x - sp.x, dy = t.y - sp.y, dz = t.z - sp.z;
        const dRot = Math.abs((t.rotY ?? 0) - entry.syncedRotY);

        const sizeChanged = ss.w !== c.width || ss.h !== c.height || ss.d !== c.depth;

        if (sizeChanged) {
            const shape = entry.body.shapes[0] as CANNON.Box;
            shape.halfExtents.set(c.width, c.height, c.depth);
            shape.updateConvexPolyhedronRepresentation();
            shape.updateBoundingSphereRadius();
            ss.w = c.width; ss.h = c.height; ss.d = c.depth;
        }

        if (dx * dx + dy * dy + dz * dz > MOVE_THRESHOLD_SQ || dRot > 1e-4 || sizeChanged) {
            rotYToCannonQuat(t.rotY ?? 0, _cannonQuat);
            entry.body.position.set(t.x, t.y, t.z);
            entry.body.quaternion.copy(_cannonQuat);
            entry.body.updateBoundingRadius();
            entry.body.updateAABB();

            sp.x = t.x; sp.y = t.y; sp.z = t.z;
            entry.syncedRotY = t.rotY ?? 0;
        }
    }

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
