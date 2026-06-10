/**
 * System vật lý va chạm dùng Cannon.js — chạy trong ECS update loop.
 *
 * Thiết kế:
 *   staticEntries  — Map<entityId, StaticEntry>: tường, sàn, vật cố định
 *   dynamicEntries — Map<entityId, DynamicEntry>: đồ vật có thể kéo (safePos = vị trí hợp lệ cuối cùng)
 *   probeBody      — body tái sử dụng để kiểm tra overlap mà không insert thêm vào world
 *
 * Collision check theo CCD sweep (sweepCCD):
 *   Thay vì teleport thẳng tới targetPos, binary-search bước nhỏ nhất không overlap
 *   → tránh tunneling khi kéo nhanh.
 *
 * Sàn (Grounded entity) bị loại khỏi staticEntries để đồ vật nằm sát sàn
 * không bị đếm là permanently overlapping.
 *
 * API công khai:
 *   clampMovement    — clamp targetPos về vị trí hợp lệ (dùng trong DragGhostController)
 *   wouldCollide     — kiểm tra boolean tại vị trí cho trước
 *   wouldCollideCustom — kiểm tra với kích thước AABB tùy ý
 *   setSafePos       — cập nhật safePos sau khi đặt đồ vật xong
 */
import * as CANNON from 'cannon-es';
import { COLLISION_TYPES } from 'cannon-es';
import { Vector3 } from 'three';

import { System } from 'src/engine/ecs/System';
import { World } from 'src/engine/ecs/World';
import { Query } from 'src/engine/ecs/Query';

import { Transform } from 'src/engine/components/core/Transform';
import { ColliderAABB } from 'src/engine/components/physics/ColliderAABB';
import { StaticBody } from 'src/engine/components/physics/StaticBody';
import { DynamicBody } from 'src/engine/components/physics/DynamicBody';
import { Grounded } from 'src/engine/components/physics/Grounded';

import {
    type StaticEntry,
    type DynamicEntry,
    createStaticBody,
    syncStaticEntry,
    updateProbeShape,
    gcStaticBodies,
    gcDynamicEntries,
    sweepCCD,
} from 'src/engine/systems/collision/cannonBodyFactory';

const _cannonPos = new CANNON.Vec3();
const _cannonQuat = new CANNON.Quaternion();

export class CannonCollisionSystem extends System {
    public readonly physicsWorld: CANNON.World;
    private probeBody: CANNON.Body;
    private staticEntries = new Map<string, StaticEntry>();
    private dynamicEntries = new Map<string, DynamicEntry>();

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
        // The floor is a StaticBody with a huge thin collider. It must NOT participate in
        // furniture overlap tests — otherwise items sitting flush on the ground (rugs, lamps)
        // read as permanently colliding. Exclude any Grounded entity from the physics world.
        const staticEids = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody)
            .filter(id => !world.hasComponent(id, Grounded));
        const dynamicEids = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);

        gcStaticBodies(this.staticEntries, staticEids, this.physicsWorld);
        gcDynamicEntries(this.dynamicEntries, dynamicEids);

        for (const id of staticEids) {
            const t = world.getComponent(id, Transform)!;
            const c = world.getComponent(id, ColliderAABB)!;
            if (!this.staticEntries.has(id)) {
                this.staticEntries.set(id, createStaticBody(t, c, this.physicsWorld));
            } else {
                syncStaticEntry(this.staticEntries.get(id)!, t, c);
            }
        }

        for (const id of dynamicEids) {
            const t = world.getComponent(id, Transform)!;
            const c = world.getComponent(id, ColliderAABB)!;

            if (!this.dynamicEntries.has(id)) {
                this.dynamicEntries.set(id, { safePos: new Vector3(t.x, t.y, t.z) });
            }
            const { safePos } = this.dynamicEntries.get(id)!;

            const { qx, qy, qz, qw } = t;
            const dx = t.x - safePos.x, dy = t.y - safePos.y, dz = t.z - safePos.z;

            if (dx * dx + dy * dy + dz * dz > 0) {
                this.prepareProbe(c);
                const clamped = sweepCCD(
                    { x: safePos.x, y: safePos.y, z: safePos.z },
                    { x: t.x, y: t.y, z: t.z },
                    c,
                    (x, y, z) => this.testOverlap(x, y, z, qx, qy, qz, qw, id),
                );
                t.x = clamped.x; t.y = clamped.y; t.z = clamped.z;
                safePos.set(clamped.x, clamped.y, clamped.z);
            }
        }
    }

    public clampMovement(
        world: World,
        entityId: string,
        targetX: number,
        targetY: number,
        targetZ: number,
    ): Vector3 | null {
        const t = world.getComponent(entityId, Transform);
        const c = world.getComponent(entityId, ColliderAABB);
        if (!t || !c) return null;

        const entry = this.dynamicEntries.get(entityId);
        const { qx, qy, qz, qw } = t;
        const safeX = entry?.safePos.x ?? t.x;
        const safeY = entry?.safePos.y ?? t.y;
        const safeZ = entry?.safePos.z ?? t.z;

        this.prepareProbe(c);

        const initiallyOverlapping = this.testOverlap(safeX, safeY, safeZ, qx, qy, qz, qw, entityId);
        if (initiallyOverlapping) {
            console.warn('[Cannon] initiallyOverlapping bypass for entity', entityId, 'at', safeX, safeY, safeZ);
            return new Vector3(targetX, targetY, targetZ);
        }

        const clamped = sweepCCD(
            { x: safeX, y: safeY, z: safeZ },
            { x: targetX, y: targetY, z: targetZ },
            c,
            (x, y, z) => this.testOverlap(x, y, z, qx, qy, qz, qw, entityId),
        );
        return new Vector3(clamped.x, clamped.y, clamped.z);
    }

    public wouldCollide(
        world: World,
        entityId: string,
        targetX: number,
        targetY: number,
        targetZ: number,
    ): boolean {
        const t = world.getComponent(entityId, Transform);
        const c = world.getComponent(entityId, ColliderAABB);
        if (!t || !c) return false;

        this.prepareProbe(c);
        return this.testOverlap(targetX, targetY, targetZ, t.qx, t.qy, t.qz, t.qw, entityId);
    }

    public wouldCollideCustom(
        targetX: number,
        targetY: number,
        targetZ: number,
        width: number,
        depth: number,
        height: number,
        qx: number,
        qy: number,
        qz: number,
        qw: number,
        ignoreEntityId: string = ""
    ): boolean {
        const shrink = 0.002;
        const hw = Math.max(0.01, width / 2 - shrink);
        const hh = Math.max(0.01, height / 2 - shrink);
        const hd = Math.max(0.01, depth / 2 - shrink);
        updateProbeShape(this.probeBody, hw, hh, hd);
        return this.testOverlap(targetX, targetY, targetZ, qx, qy, qz, qw, ignoreEntityId);
    }

    public setSafePos(entityId: string, x: number, y: number, z: number): void {
        const entry = this.dynamicEntries.get(entityId);
        if (entry) entry.safePos.set(x, y, z);
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
        updateProbeShape(
            this.probeBody,
            Math.max(0.01, c.width - shrink),
            Math.max(0.01, c.height - shrink),
            Math.max(0.01, c.depth - shrink),
        );
    }

    private testOverlap(
        x: number, y: number, z: number,
        qx: number, qy: number, qz: number, qw: number,
        ignoreEntityId: string = "",
    ): boolean {
        _cannonPos.set(x, y, z);
        _cannonQuat.set(qx, qy, qz, qw);
        this.probeBody.position.copy(_cannonPos);
        this.probeBody.quaternion.copy(_cannonQuat);
        this.probeBody.updateBoundingRadius();
        this.probeBody.updateAABB();

        const bodies = this.physicsWorld.bodies;
        const n = bodies.length;
        const selfStaticEntry = ignoreEntityId !== "" ? this.staticEntries.get(ignoreEntityId) : null;

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
}
