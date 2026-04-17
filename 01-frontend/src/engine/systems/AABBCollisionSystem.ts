import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { World } from "../ecs/World";

import { Transform } from "../components/Transform";
import { ColliderAABB } from "../components/ColliderAABB";
import { StaticBody } from "../components/StaticBody";
import { DynamicBody } from "../components/DynamicBody";

export class AABBCollisionSystem extends System {
    // Track last non-penetrating positions for dynamic entities (e.g. while dragging)
    private lastSafePos = new Map<number, { x: number; y: number; z: number }>();
    private readonly epsilon = 1e-4;

    // Static entity query cache arrays to prevent GC pauses
    private sCx: number[] = [];
    private sCy: number[] = [];
    private sCz: number[] = [];
    private sHx: number[] = [];
    private sHy: number[] = [];
    private sHz: number[] = [];
    private sId: number[] = [];

    update(world: World): void {
        const dynamicEntities = Query.entitiesWith(
            world,
            Transform,
            ColliderAABB,
            DynamicBody
        );

        const staticEntities = Query.entitiesWith(
            world,
            Transform,
            ColliderAABB,
            StaticBody
        );

        const sCount = staticEntities.length;

        // Resize capability if needed (though JS handles it automatically, it's good practice)
        if (this.sCx.length < sCount) {
            this.sCx.length = sCount;
            this.sCy.length = sCount;
            this.sCz.length = sCount;
            this.sHx.length = sCount;
            this.sHy.length = sCount;
            this.sHz.length = sCount;
            this.sId.length = sCount;
        }

        for (let i = 0; i < sCount; i++) {
            const s = staticEntities[i];
            this.sId[i] = s;
            const tB = world.getComponent(s, Transform)!;
            const cB = world.getComponent(s, ColliderAABB)!;
            this.sCx[i] = tB.x;
            this.sCy[i] = tB.y;
            this.sCz[i] = tB.z;
            this.sHx[i] = cB.width;
            this.sHy[i] = cB.height;
            this.sHz[i] = cB.depth;
        }

        const overlapsOn = (aCenter: number, aHalf: number, bCenter: number, bHalf: number) =>
            Math.abs(aCenter - bCenter) < aHalf + bHalf - this.epsilon;

        const collidesAnyStaticAt = (x: number, y: number, z: number, hAx: number, hAy: number, hAz: number, d: number) => {
            for (let i = 0; i < sCount; i++) {
                if (this.sId[i] === d) continue;
                if (
                    overlapsOn(x, hAx, this.sCx[i], this.sHx[i]) &&
                    overlapsOn(y, hAy, this.sCy[i], this.sHy[i]) &&
                    overlapsOn(z, hAz, this.sCz[i], this.sHz[i])
                ) {
                    return true;
                }
            }
            return false;
        };

        // Swept AABB vs static AABBs using Minkowski expansion + ray/slab test.
        // This prevents "teleporting" through blockers when the gizmo drags past in one frame.
        const sweepToi = (
            fromX: number,
            fromY: number,
            fromZ: number,
            toX: number,
            toY: number,
            toZ: number,
            hAx: number,
            hAy: number,
            hAz: number,
            d: number
        ): number | null => {
            const dx = toX - fromX;
            const dy = toY - fromY;
            const dz = toZ - fromZ;

            let bestT = Number.POSITIVE_INFINITY;

            for (let i = 0; i < sCount; i++) {
                if (this.sId[i] === d) continue;

                const hBx = this.sHx[i];
                const hBy = this.sHy[i];
                const hBz = this.sHz[i];

                // Expanded (Minkowski) box around B
                const ex = hBx + hAx;
                const ey = hBy + hAy;
                const ez = hBz + hAz;

                // Point start relative to B center
                const sx = fromX - this.sCx[i];
                const sy = fromY - this.sCy[i];
                const sz = fromZ - this.sCz[i];

                // Slab intervals per axis
                let xEntry = -Infinity;
                let xExit = Infinity;
                if (dx === 0) {
                    if (!(Math.abs(sx) < ex - this.epsilon)) continue;
                } else {
                    let t1 = (-ex - sx) / dx;
                    let t2 = (ex - sx) / dx;
                    if (t1 > t2) [t1, t2] = [t2, t1];
                    xEntry = t1;
                    xExit = t2;
                }

                let yEntry = -Infinity;
                let yExit = Infinity;
                if (dy === 0) {
                    if (!(Math.abs(sy) < ey - this.epsilon)) continue;
                } else {
                    let t1 = (-ey - sy) / dy;
                    let t2 = (ey - sy) / dy;
                    if (t1 > t2) [t1, t2] = [t2, t1];
                    yEntry = t1;
                    yExit = t2;
                }

                let zEntry = -Infinity;
                let zExit = Infinity;
                if (dz === 0) {
                    if (!(Math.abs(sz) < ez - this.epsilon)) continue;
                } else {
                    let t1 = (-ez - sz) / dz;
                    let t2 = (ez - sz) / dz;
                    if (t1 > t2) [t1, t2] = [t2, t1];
                    zEntry = t1;
                    zExit = t2;
                }

                const entry = Math.max(xEntry, yEntry, zEntry);
                const exit = Math.min(xExit, yExit, zExit);

                // No hit if interval is empty or outside [0,1]
                if (entry > exit) continue;
                if (exit < 0) continue;
                if (entry > 1) continue;

                const tHit = Math.max(0, entry);
                // If we start exactly on a boundary, entry may be 0.
                // Only ignore t=0 when the end position is still outside the expanded box
                // (i.e. we're moving away or sliding without entering). If the end is inside,
                // this is a real collision and must clamp.
                if (tHit === 0) {
                    const endInside =
                        Math.abs(sx + dx) < ex - this.epsilon &&
                        Math.abs(sy + dy) < ey - this.epsilon &&
                        Math.abs(sz + dz) < ez - this.epsilon;
                    if (!endInside) continue;
                }
                if (tHit < bestT) bestT = tHit;
            }

            return bestT !== Number.POSITIVE_INFINITY ? bestT : null;
        };

        // Remove cache entries for entities that are no longer dynamic.
        if (this.lastSafePos.size > dynamicEntities.length) {
            const dynamicSet = new Set(dynamicEntities);
            for (const id of this.lastSafePos.keys()) {
                if (!dynamicSet.has(id)) this.lastSafePos.delete(id);
            }
        }

        for (const d of dynamicEntities) {
            const tA = world.getComponent(d, Transform)!;
            const cA = world.getComponent(d, ColliderAABB)!;

            const last = this.lastSafePos.get(d);
            const hasLast = last != null;
            const lastX = last?.x ?? tA.x;
            const lastY = last?.y ?? tA.y;
            const lastZ = last?.z ?? tA.z;

            const hAx = cA.width;
            const hAy = cA.height;
            const hAz = cA.depth;

            const proposedX = tA.x;
            const proposedY = tA.y;
            const proposedZ = tA.z;

            const tHit = sweepToi(lastX, lastY, lastZ, proposedX, proposedY, proposedZ, hAx, hAy, hAz, d);

            let outX = proposedX;
            let outY = proposedY;
            let outZ = proposedZ;

            if (tHit != null) {
                const mdx = proposedX - lastX;
                const mdy = proposedY - lastY;
                const mdz = proposedZ - lastZ;
                const len = Math.hypot(mdx, mdy, mdz);
                if (len > 0) {
                    const backoff = this.epsilon / len;
                    const t = Math.max(0, tHit - backoff);
                    outX = lastX + mdx * t;
                    outY = lastY + mdy * t;
                    outZ = lastZ + mdz * t;
                } else {
                    outX = lastX;
                    outY = lastY;
                    outZ = lastZ;
                }
            }

            if (collidesAnyStaticAt(outX, outY, outZ, hAx, hAy, hAz, d)) {
                if (hasLast) {
                    outX = lastX;
                    outY = lastY;
                    outZ = lastZ;
                } else {
                    // First frame being dynamic: we might already be "teleported" inside a static (e.g. ground).
                    // Depenetrate by pushing out along the minimum-overlap axis.
                    for (let iter = 0; iter < 4; iter++) {
                        let bestOverlap = Number.POSITIVE_INFINITY;
                        let pushX = 0;
                        let pushY = 0;
                        let pushZ = 0;
                        let any = false;

                        for (let i = 0; i < sCount; i++) {
                            if (this.sId[i] === d) continue;

                            const dx = outX - this.sCx[i];
                            const dy = outY - this.sCy[i];
                            const dz = outZ - this.sCz[i];

                            const ox = (hAx + this.sHx[i]) - Math.abs(dx);
                            const oy = (hAy + this.sHy[i]) - Math.abs(dy);
                            const oz = (hAz + this.sHz[i]) - Math.abs(dz);

                            if (ox <= 0 || oy <= 0 || oz <= 0) continue;
                            any = true;

                            // Choose minimum overlap axis for this collider
                            if (ox <= oy && ox <= oz) {
                                if (ox < bestOverlap) {
                                    bestOverlap = ox;
                                    pushX = dx >= 0 ? ox + this.epsilon : -(ox + this.epsilon);
                                    pushY = 0;
                                    pushZ = 0;
                                }
                            } else if (oy <= ox && oy <= oz) {
                                if (oy < bestOverlap) {
                                    bestOverlap = oy;
                                    pushX = 0;
                                    pushY = dy >= 0 ? oy + this.epsilon : -(oy + this.epsilon);
                                    pushZ = 0;
                                }
                            } else {
                                if (oz < bestOverlap) {
                                    bestOverlap = oz;
                                    pushX = 0;
                                    pushY = 0;
                                    pushZ = dz >= 0 ? oz + this.epsilon : -(oz + this.epsilon);
                                }
                            }
                        }

                        if (!any || bestOverlap === Number.POSITIVE_INFINITY) break;

                        outX += pushX;
                        outY += pushY;
                        outZ += pushZ;

                        if (!collidesAnyStaticAt(outX, outY, outZ, hAx, hAy, hAz, d)) break;
                    }
                }
            }

            tA.x = outX;
            tA.y = outY;
            tA.z = outZ;

            this.lastSafePos.set(d, { x: outX, y: outY, z: outZ });
        }
    }
}