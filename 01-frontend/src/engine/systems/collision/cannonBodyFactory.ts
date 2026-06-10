import * as CANNON from "cannon-es";
import { Vector3 } from "three";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";

export const MOVE_THRESHOLD_SQ = 1e-8;

export interface StaticEntry {
    body: CANNON.Body;
    syncedPos: { x: number; y: number; z: number };
    syncedQuat: { x: number; y: number; z: number; w: number };
    syncedSize: { w: number; h: number; d: number };
}

export interface DynamicEntry {
    safePos: Vector3;
}

/** Đổi kích thước hình của body thăm dò cho khớp với nửa-kích-thước (có co lại). */
export function updateProbeShape(probe: CANNON.Body, hw: number, hh: number, hd: number): void {
    if (probe.shapes.length === 0) {
        probe.addShape(new CANNON.Box(new CANNON.Vec3(hw, hh, hd)));
    } else {
        const shape = probe.shapes[0] as CANNON.Box;
        shape.halfExtents.set(hw, hh, hd);
        shape.updateConvexPolyhedronRepresentation();
        shape.updateBoundingSphereRadius();
    }
}

/** Tạo một CANNON.Body tĩnh mới và StaticEntry tương ứng từ các component ECS. */
export function createStaticBody(
    t: Transform,
    c: ColliderAABB,
    physicsWorld: CANNON.World,
): StaticEntry {
    const shape = new CANNON.Box(new CANNON.Vec3(c.width, c.height, c.depth));
    const body = new CANNON.Body({ mass: 0, shape });
    const q = new CANNON.Quaternion(t.qx, t.qy, t.qz, t.qw);
    body.position.set(t.x, t.y, t.z);
    body.quaternion.copy(q);
    body.updateBoundingRadius();
    body.updateAABB();
    physicsWorld.addBody(body);
    return {
        body,
        syncedPos: { x: t.x, y: t.y, z: t.z },
        syncedQuat: { x: t.qx, y: t.qy, z: t.qz, w: t.qw },
        syncedSize: { w: c.width, h: c.height, d: c.depth },
    };
}

/**
 * Đồng bộ một body tĩnh đã tồn tại khi transform/kích thước có thể đã thay đổi.
 * Trả về true nếu body thực sự được cập nhật.
 */
export function syncStaticEntry(entry: StaticEntry, t: Transform, c: ColliderAABB): boolean {
    const { body, syncedPos: sp, syncedSize: ss, syncedQuat: sq } = entry;

    const sizeChanged = ss.w !== c.width || ss.h !== c.height || ss.d !== c.depth;
    if (sizeChanged) {
        const shape = body.shapes[0] as CANNON.Box;
        shape.halfExtents.set(c.width, c.height, c.depth);
        shape.updateConvexPolyhedronRepresentation();
        shape.updateBoundingSphereRadius();
        ss.w = c.width; ss.h = c.height; ss.d = c.depth;
    }

    const dx = t.x - sp.x, dy = t.y - sp.y, dz = t.z - sp.z;
    const dot = t.qx * sq.x + t.qy * sq.y + t.qz * sq.z + t.qw * sq.w;
    const quatDirty = Math.abs(1 - Math.abs(dot)) > 1e-8;

    if (dx * dx + dy * dy + dz * dz > MOVE_THRESHOLD_SQ || quatDirty || sizeChanged) {
        const q = new CANNON.Quaternion(t.qx, t.qy, t.qz, t.qw);
        body.position.set(t.x, t.y, t.z);
        body.quaternion.copy(q);
        body.updateBoundingRadius();
        body.updateAABB();
        sp.x = t.x; sp.y = t.y; sp.z = t.z;
        sq.x = t.qx; sq.y = t.qy; sq.z = t.qz; sq.w = t.qw;
        return true;
    }
    return false;
}

/** Xóa các static entry cũ khỏi cả Map lẫn thế giới vật lý. */
export function gcStaticBodies(
    entries: Map<string, StaticEntry>,
    alive: string[],
    physicsWorld: CANNON.World,
): void {
    const aliveSet = new Set(alive);
    for (const [id, entry] of entries) {
        if (!aliveSet.has(id)) {
            physicsWorld.removeBody(entry.body);
            entries.delete(id);
        }
    }
}

/** Xóa các dynamic entry cũ khỏi Map. */
export function gcDynamicEntries(entries: Map<string, DynamicEntry>, alive: string[]): void {
    const aliveSet = new Set(alive);
    for (const id of entries.keys()) {
        if (!aliveSet.has(id)) entries.delete(id);
    }
}

/**
 * Quét CCD từ `from` về phía `to`, trả về vị trí không-chồng-lấn cuối cùng.
 * `testFn` nhận tọa độ tuyệt đối (x, y, z) và trả về true khi phát hiện va chạm.
 */
export function sweepCCD(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    c: ColliderAABB,
    testFn: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number } {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq === 0) return { x: to.x, y: to.y, z: to.z };

    const dist = Math.sqrt(distSq);
    const minExtent = Math.min(c.width, c.height, c.depth);
    const stepSize = Math.max(0.05, minExtent * 0.5);
    const steps = Math.min(100, Math.ceil(dist / stepSize));

    let lastValidX = from.x, lastValidY = from.y, lastValidZ = from.z;

    for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const testX = from.x + dx * frac;
        const testY = from.y + dy * frac;
        const testZ = from.z + dz * frac;

        if (testFn(testX, testY, testZ)) {
            let t0 = (i - 1) / steps;
            let t1 = frac;
            for (let j = 0; j < 4; j++) {
                const tm = (t0 + t1) / 2;
                if (testFn(from.x + dx * tm, from.y + dy * tm, from.z + dz * tm)) {
                    t1 = tm;
                } else {
                    t0 = tm;
                }
            }
            lastValidX = from.x + dx * t0;
            lastValidY = from.y + dy * t0;
            lastValidZ = from.z + dz * t0;
            break;
        } else {
            lastValidX = testX;
            lastValidY = testY;
            lastValidZ = testZ;
        }
    }

    return { x: lastValidX, y: lastValidY, z: lastValidZ };
}
