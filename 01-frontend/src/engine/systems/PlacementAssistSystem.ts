import { System } from "src/engine/ecs/System";
import { Query } from "src/engine/ecs/Query";
import { World } from "src/engine/ecs/World";

import { Transform } from "src/engine/components/Transform";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { StaticBody } from "src/engine/components/StaticBody";
import { DynamicBody } from "src/engine/components/DynamicBody";
import { SnapToGrid } from "src/engine/components/SnapToGrid";
import { AutoAlign } from "src/engine/components/AutoAlign";

export class PlacementAssistSystem extends System {
    private readonly epsilon = 1e-4;

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

        if (dynamicEntities.length === 0) return;

        const staticEntities = Query.entitiesWith(
            world,
            Transform,
            ColliderAABB,
            StaticBody
        );

        const sCount = staticEntities.length;

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
            this.sHx[i] = cB.width;  // half extents
            this.sHy[i] = cB.height;
            this.sHz[i] = cB.depth;
        }

        const overlapsOn = (aCenter: number, aHalf: number, bCenter: number, bHalf: number) =>
            Math.abs(aCenter - bCenter) < aHalf + bHalf - this.epsilon;

        const shouldSnapAxis = (axes: string, axis: "x" | "y" | "z") => {
            if (axes === "xyz") return true;
            if (axes === axis) return true;
            return axes.includes(axis);
        };

        for (const d of dynamicEntities) {
            const tA = world.getComponent(d, Transform)!;
            const cA = world.getComponent(d, ColliderAABB)!;

            const snap = world.getComponent(d, SnapToGrid);
            if (snap?.enabled && snap.size > 0) {
                const size = snap.size;
                if (shouldSnapAxis(snap.axes, "x")) {
                    tA.x = Math.round((tA.x - snap.offsetX) / size) * size + snap.offsetX;
                }
                if (shouldSnapAxis(snap.axes, "y")) {
                    tA.y = Math.round((tA.y - snap.offsetY) / size) * size + snap.offsetY;
                }
                if (shouldSnapAxis(snap.axes, "z")) {
                    tA.z = Math.round((tA.z - snap.offsetZ) / size) * size + snap.offsetZ;
                }
            }

            const align = world.getComponent(d, AutoAlign);
            if (!align?.enabled || sCount === 0) continue;

            const hAx = cA.width;
            const hAy = cA.height;
            const hAz = cA.depth;

            const tol = align.tolerance;
            const doX = align.axes === "x" || align.axes === "xz";
            const doZ = align.axes === "z" || align.axes === "xz";

            if (doX) {
                let bestDist = tol;
                let bestX = tA.x;
                for (let i = 0; i < sCount; i++) {
                    if (this.sId[i] === d) continue;
                    if (!overlapsOn(tA.y, hAy, this.sCy[i], this.sHy[i])) continue;
                    if (!overlapsOn(tA.z, hAz, this.sCz[i], this.sHz[i])) continue;

                    const targetPos1 = this.sCx[i] - (this.sHx[i] + hAx) - this.epsilon;
                    const targetPos2 = this.sCx[i] + (this.sHx[i] + hAx) + this.epsilon;
                    const d1 = Math.abs(tA.x - targetPos1);
                    if (d1 < bestDist) {
                        bestDist = d1;
                        bestX = targetPos1;
                    }
                    const d2 = Math.abs(tA.x - targetPos2);
                    if (d2 < bestDist) {
                        bestDist = d2;
                        bestX = targetPos2;
                    }
                }
                tA.x = bestX;
            }

            if (doZ) {
                let bestDist = tol;
                let bestZ = tA.z;
                for (let i = 0; i < sCount; i++) {
                    if (this.sId[i] === d) continue;
                    if (!overlapsOn(tA.y, hAy, this.sCy[i], this.sHy[i])) continue;
                    if (!overlapsOn(tA.x, hAx, this.sCx[i], this.sHx[i])) continue;

                    const targetPos1 = this.sCz[i] - (this.sHz[i] + hAz) - this.epsilon;
                    const targetPos2 = this.sCz[i] + (this.sHz[i] + hAz) + this.epsilon;
                    const d1 = Math.abs(tA.z - targetPos1);
                    if (d1 < bestDist) {
                        bestDist = d1;
                        bestZ = targetPos1;
                    }
                    const d2 = Math.abs(tA.z - targetPos2);
                    if (d2 < bestDist) {
                        bestDist = d2;
                        bestZ = targetPos2;
                    }
                }
                tA.z = bestZ;
            }
        }
    }
}

