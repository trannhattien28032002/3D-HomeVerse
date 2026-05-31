/**
 * WallGeometrySystem — tính toán geometry miter cho tất cả tường.
 *
 * Chạy mỗi frame. Chỉ rebuild khi WallPolygon bị xóa (change signal) hoặc
 * khi node position thay đổi.
 *
 * Thuật toán miter:
 *   1. Với mỗi node, gom tất cả wall đính vào (WallAtNode[])
 *   2. Sắp xếp radially theo góc
 *   3. computeMiters(): tính điểm giao (leftPoint, rightPoint) tại mỗi góc tường
 *      - Nếu góc đủ nhọn và khoảng cách trong giới hạn → miter (điểm nhọn)
 *      - Ngược lại → bevel (cắt vát)
 *   4. Cập nhật WallPolygon (4 điểm XZ) cho mỗi wall
 *   5. Rebuild Three.js ExtrudeGeometry từ polygon + height
 *   6. Cap mesh tại junction ≥ 3 tường
 *
 * Cache: nodeCache lưu miterPoints theo hash (pos + walls) để tránh tính lại.
 * Output: WallPolygon component + Three.js mesh được cập nhật trong scene.
 */
import * as THREE from "three";

import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { WallNodes } from "src/engine/components/WallNodes";
import { WallSize } from "src/engine/components/WallSize";
import { WallPolygon, type Point2D } from "src/engine/components/WallPolygon";
import { Mesh } from "src/engine/components/Mesh";
import { Transform } from "src/engine/components/Transform";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";

import { type WallAtNode, computeMiters } from "src/engine/systems/wallCornerJoiner";
import { buildExtrudeGeo, rebuildWallMesh } from "src/engine/systems/wallMeshBuilder";

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

            if (meshComp) rebuildWallMesh(meshComp.mesh, newPoly, size.height, wallY);
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
        const geo = buildExtrudeGeo(capPolygon, height, Y);

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
}
