import * as THREE from "three";

import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { Query } from "../ecs/Query";

import { WallNodes } from "../components/WallNodes";
import { WallSize } from "../components/WallSize";
import { WallPolygon, type Point2D } from "../components/WallPolygon";
import { Mesh } from "../components/Mesh";
import { Transform } from "../components/Transform";
import { ColliderAABB } from "../components/ColliderAABB";
import { NodeRegistry } from "../graph/NodeRegistry";
import { MeshRegistry } from "../rendering/MeshRegistry";
import { MaterialRegistry } from "../rendering/MaterialRegistry";

type WallAtNode = {
    entity: number;
    nx: number; nz: number;
    thickness: number;
    angle: number;
    leftNx: number; leftNz: number;
    rightNx: number; rightNz: number;
};

function computePair(
    nodePos: Point2D,
    w1: WallAtNode,
    w2: WallAtNode,
    miterPoints: Map<number, { leftPoint: Point2D; rightPoint: Point2D }>,
): Point2D | null {
    const h1 = w1.thickness / 2;
    const h2 = w2.thickness / 2;

    const n1x = w1.leftNx, n1z = w1.leftNz;
    const n2x = w2.rightNx, n2z = w2.rightNz;

    const c = n1x * n2x + n1z * n2z;

    let inter: Point2D | null = null;
    const parallel = Math.abs(1 - c * c) < 1e-5;

    if (!parallel) {
        const a = (h1 - h2 * c) / (1 - c * c);
        const b = (h2 - h1 * c) / (1 - c * c);
        inter = {
            x: nodePos.x + a * n1x + b * n2x,
            z: nodePos.z + a * n1z + b * n2z,
        };
    }
    const cross = w1.nx * w2.nz - w1.nz * w2.nx;
    const isOuter = cross < -1e-5;
    const MITER_LIMIT = 2.5;
    const maxDist = Math.max(h1, h2) * MITER_LIMIT * 2;

    let useMiter = false;

    if (isOuter && inter) {
        const miterLength = Math.hypot(inter.x - nodePos.x, inter.z - nodePos.z);
        if (miterLength <= maxDist) {
            useMiter = true;
        }
    }

    if (useMiter && inter) {
        return inter;
    }

    const p1: Point2D = { x: nodePos.x + n1x * h1, z: nodePos.z + n1z * h1 };
    const p2: Point2D = { x: nodePos.x + n2x * h2, z: nodePos.z + n2z * h2 };

    let bevel1 = p1;
    let bevel2 = p2;

    if (!parallel && inter) {
        const t1Raw = (inter.x - nodePos.x) * w1.nx + (inter.z - nodePos.z) * w1.nz;
        const t2Raw = (inter.x - nodePos.x) * w2.nx + (inter.z - nodePos.z) * w2.nz;

        const t1 = Math.min(Math.max(t1Raw, 0), maxDist);
        const t2 = Math.min(Math.max(t2Raw, 0), maxDist);

        bevel1 = { x: nodePos.x + t1 * w1.nx + n1x * h1, z: nodePos.z + t1 * w1.nz + n1z * h1 };
        bevel2 = { x: nodePos.x + t2 * w2.nx + n2x * h2, z: nodePos.z + t2 * w2.nz + n2z * h2 };
    }

    if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
    if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });

    miterPoints.get(w1.entity)!.leftPoint = bevel1;
    miterPoints.get(w2.entity)!.rightPoint = bevel2;

    return null;
}

function computeMiters(
    nodePos: Point2D,
    walls: WallAtNode[],
): {
    miterPoints: Map<number, { leftPoint: Point2D; rightPoint: Point2D }>;
    capPolygon: Point2D[];
} {
    const miterPoints = new Map<number, { leftPoint: Point2D; rightPoint: Point2D }>();

    if (walls.length === 0) return { miterPoints, capPolygon: [] };
    const sorted = [...walls].sort((a, b) => a.angle - b.angle);

    if (sorted.length === 1) {
        const w = sorted[0];
        const h = w.thickness / 2;
        miterPoints.set(w.entity, {
            leftPoint: { x: nodePos.x + w.leftNx * h, z: nodePos.z + w.leftNz * h },
            rightPoint: { x: nodePos.x + w.rightNx * h, z: nodePos.z + w.rightNz * h },
        });
        return { miterPoints, capPolygon: [] };
    }

    const capPoints: Point2D[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const w1 = sorted[i];
        const w2 = sorted[(i + 1) % sorted.length];

        let angleDiff = w2.angle - w1.angle;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

        if (Math.abs(Math.abs(angleDiff) - Math.PI) < 1e-3) {
            const h1 = w1.thickness / 2;
            const p1: Point2D = { x: nodePos.x + w1.leftNx * h1, z: nodePos.z + w1.leftNz * h1 };
            if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            miterPoints.get(w1.entity)!.leftPoint = p1;
            miterPoints.get(w2.entity)!.rightPoint = p1;
            capPoints.push(p1);
            continue;
        }

        const sharedPoint = computePair(nodePos, w1, w2, miterPoints);
        if (sharedPoint !== null) {
            if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            miterPoints.get(w1.entity)!.leftPoint = sharedPoint;
            miterPoints.get(w2.entity)!.rightPoint = sharedPoint;
            capPoints.push(sharedPoint);
        } else {
            const pLeft = miterPoints.get(w1.entity)!.leftPoint;
            const pRight = miterPoints.get(w2.entity)!.rightPoint;
            capPoints.push(pLeft, pRight);
        }
    }

    const capPolygon = capPoints.length >= 3 ? capPoints : [];
    return { miterPoints, capPolygon };
}

export class WallGeometrySystem extends System {
    private readonly nodeReg: NodeRegistry;
    private readonly meshRegistry: MeshRegistry;
    private readonly materialRegistry: MaterialRegistry;
    private scene: THREE.Scene;

    /** Change-detection metadata for cap meshes (actual meshes live in MeshRegistry). */
    private capMeta = new Map<number, { poly: Point2D[]; height: number }>();

    private nodeCache = new Map<number, {
        hash: string;
        miterPoints: Map<number, { leftPoint: Point2D; rightPoint: Point2D }>;
        capPolygon: Point2D[];
    }>();

    constructor(nodes: NodeRegistry, scene: THREE.Scene, meshRegistry: MeshRegistry, materialRegistry: MaterialRegistry) {
        super();
        this.nodeReg = nodes;
        this.scene = scene;
        this.meshRegistry = meshRegistry;
        this.materialRegistry = materialRegistry;
    }

    update(world: World): void {
        const wallEntities = Query.entitiesWith(world, WallNodes, WallSize);
        this.nodeReg.nodeCaps.clear();

        if (wallEntities.length === 0) {
            for (const nodeId of [...this.capMeta.keys()]) {
                this.meshRegistry.dispose(`cap-${nodeId}`);
            }
            this.capMeta.clear();
            return;
        }

        const nodeWalls = new Map<number, WallAtNode[]>();

        for (const e of wallEntities) {
            const wn = world.getComponent(e, WallNodes)!;
            const sn = this.nodeReg.get(wn.startNodeId);
            const en = this.nodeReg.get(wn.endNodeId);
            if (!sn || !en) continue;

            const dx = en.x - sn.x;
            const dz = en.z - sn.z;
            const len = Math.hypot(dx, dz);
            if (len < 1e-6) continue;

            const ux = dx / len, uz = dz / len;

            if (!nodeWalls.has(wn.startNodeId)) nodeWalls.set(wn.startNodeId, []);

            nodeWalls.get(wn.startNodeId)!.push({
                entity: e, nx: ux, nz: uz, thickness: wn.thickness,
                angle: Math.atan2(uz, ux),
                leftNx: -uz, leftNz: ux,
                rightNx: uz, rightNz: -ux,
            });

            if (!nodeWalls.has(wn.endNodeId)) nodeWalls.set(wn.endNodeId, []);

            nodeWalls.get(wn.endNodeId)!.push({
                entity: e, nx: -ux, nz: -uz, thickness: wn.thickness,
                angle: Math.atan2(-uz, -ux),
                leftNx: uz, leftNz: -ux,
                rightNx: -uz, rightNz: ux,
            });
        }

        type MR = { startLeft?: Point2D; startRight?: Point2D; endLeft?: Point2D; endRight?: Point2D };
        const miterResult = new Map<number, MR>();
        for (const e of wallEntities) miterResult.set(e, {});

        for (const [nodeId, cwList] of nodeWalls) {
            const nd = this.nodeReg.get(nodeId);
            if (!nd) continue;

            let hash = `${nd.x.toFixed(2)},${nd.z.toFixed(2)}`;
            for (const cw of cwList) {
                hash += `|${cw.entity},${cw.nx.toFixed(4)},${cw.nz.toFixed(4)},${cw.thickness.toFixed(2)}`;
            }

            let computed = this.nodeCache.get(nodeId);
            if (!computed || computed.hash !== hash) {
                const { miterPoints, capPolygon } = computeMiters({ x: nd.x, z: nd.z }, cwList);
                computed = { hash, miterPoints, capPolygon };
                this.nodeCache.set(nodeId, computed);
            }

            if (computed.capPolygon.length >= 3) {
                this.nodeReg.nodeCaps.set(nodeId, computed.capPolygon);
            }

            for (const [eid, m] of computed.miterPoints) {
                const res = miterResult.get(eid);
                if (!res) continue;
                const wn = world.getComponent(eid, WallNodes)!;

                if (nodeId === wn.startNodeId) {
                    res.startLeft = m.leftPoint;
                    res.startRight = m.rightPoint;
                } else {
                    res.endRight = m.leftPoint;
                    res.endLeft = m.rightPoint;
                }
            }

            let maxHeight = 1;
            for (const cw of cwList) {
                const size = world.getComponent(cw.entity, WallSize);
                if (size && size.height > maxHeight) maxHeight = size.height;
            }
            this.updateCapMesh(nodeId, computed.capPolygon, maxHeight);
        }

        for (const nodeId of this.nodeCache.keys()) {
            if (!nodeWalls.has(nodeId)) this.nodeCache.delete(nodeId);
        }

        // Remove cap meshes for nodes that are no longer junction caps
        for (const nodeId of [...this.capMeta.keys()]) {
            if (!this.nodeReg.nodeCaps.has(nodeId)) {
                this.meshRegistry.dispose(`cap-${nodeId}`);
                this.capMeta.delete(nodeId);
            }
        }

        for (const e of wallEntities) {
            const res = miterResult.get(e)!;
            if (!res.startLeft || !res.startRight || !res.endLeft || !res.endRight) continue;

            const newPoly: [Point2D, Point2D, Point2D, Point2D] = [
                res.startLeft,
                res.endLeft,
                res.endRight,
                res.startRight,
            ];

            const size = world.getComponent(e, WallSize)!;
            const existing = world.getComponent(e, WallPolygon);
            const meshComp = world.getComponent(e, Mesh);
            const transform = world.getComponent(e, Transform);
            const collider = world.getComponent(e, ColliderAABB);
            const wn = world.getComponent(e, WallNodes)!;

            const sn = this.nodeReg.get(wn.startNodeId)!;
            const en2 = this.nodeReg.get(wn.endNodeId)!;
            const dx = en2.x - sn.x, dz = en2.z - sn.z;
            const len = Math.hypot(dx, dz);
            const rotY = -Math.atan2(dz, dx);
            const cx = (sn.x + en2.x) / 2;
            const cz = (sn.z + en2.z) / 2;
            const wallY = size.height / 2;

            if (transform) { transform.x = cx; transform.y = wallY; transform.z = cz; transform.rotY = rotY; }
            if (size) { size.length = len; }
            if (collider) { collider.width = len / 2; }

            const changed = !existing || (() => {
                for (let i = 0; i < 4; i++) {
                    if (
                        Math.abs(existing.points[i].x - newPoly[i].x) > 1e-5 ||
                        Math.abs(existing.points[i].z - newPoly[i].z) > 1e-5
                    ) return true;
                }
                return false;
            })();

            if (!changed) continue;

            if (!existing) {
                world.addComponent(e, new WallPolygon(newPoly, size.height));
            } else {
                existing.points = newPoly;
                existing.height = size.height;
            }

            if (meshComp) this.rebuildWallMesh(meshComp.mesh, newPoly, size.height, wallY);
        }
    }

    private updateCapMesh(nodeId: number, capPolygon: Point2D[], height: number): void {
        if (capPolygon.length < 3) {
            if (this.meshRegistry.has(`cap-${nodeId}`)) {
                this.meshRegistry.dispose(`cap-${nodeId}`);
                this.capMeta.delete(nodeId);
            }
            return;
        }

        const existingMeta = this.capMeta.get(nodeId);
        const existingMesh = this.meshRegistry.get(`cap-${nodeId}`);

        const changed = !existingMeta || !existingMesh ||
            existingMeta.height !== height ||
            existingMeta.poly.length !== capPolygon.length ||
            (() => {
                for (let i = 0; i < capPolygon.length; i++) {
                    if (
                        Math.abs(existingMeta.poly[i].x - capPolygon[i].x) > 1e-5 ||
                        Math.abs(existingMeta.poly[i].z - capPolygon[i].z) > 1e-5
                    ) return true;
                }
                return false;
            })();

        if (!changed) return;

        const Y = height / 2;

        const shape = new THREE.Shape();
        shape.moveTo(capPolygon[0].x, -capPolygon[0].z);
        for (let i = 1; i < capPolygon.length; i++)
            shape.lineTo(capPolygon[i].x, -capPolygon[i].z);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, -Y, 0);

        if (existingMesh) {
            existingMesh.geometry.dispose();
            existingMesh.geometry = geo;
            existingMesh.position.set(0, Y, 0);
        } else {
            const mat = this.materialRegistry.get({ color: 0xcccccc, metalness: 0, roughness: 0.9 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, Y, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.meshRegistry.register(`cap-${nodeId}`, mesh);
        }

        this.capMeta.set(nodeId, { poly: [...capPolygon], height });
    }

    dispose(): void {
        // Cap meshes are owned by meshRegistry — engine.dispose() calls disposeAll().
        // Just clear local metadata.
        this.capMeta.clear();
        this.nodeCache.clear();
    }

    private rebuildWallMesh(
        mesh: THREE.Mesh,
        worldPoly: [Point2D, Point2D, Point2D, Point2D],
        height: number,
        wallY: number,
    ): void {
        if (mesh.geometry) mesh.geometry.dispose();

        const shape = new THREE.Shape();
        shape.moveTo(worldPoly[0].x, -worldPoly[0].z);
        shape.lineTo(worldPoly[1].x, -worldPoly[1].z);
        shape.lineTo(worldPoly[2].x, -worldPoly[2].z);
        shape.lineTo(worldPoly[3].x, -worldPoly[3].z);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, -wallY, 0);

        mesh.geometry = geo;
        mesh.rotation.set(0, 0, 0);
        mesh.position.set(0, wallY, 0);
    }
}
