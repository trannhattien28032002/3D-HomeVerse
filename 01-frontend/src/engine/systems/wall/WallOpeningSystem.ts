/**
 * WallOpeningSystem — khoét lỗ cửa/cửa sổ trên mesh tường (chạy SAU WallGeometrySystem).
 *
 * Chiến lược "post-pass": WallGeometrySystem dựng mesh tường đặc như thường (miter,
 * geometry căn giữa Y, RenderSystem nâng position.y = transform.y = height/2). Hệ này
 * gom WallOpening theo hostWallId rồi:
 *   - Tường CÓ lỗ: dựng lại geometry căn-giữa-Y (XZ world-space) + CSG trừ lỗ, gán vào
 *     mesh. Geometry theo cùng quy ước WorldSpaceMesh nên RenderSystem nâng position.y
 *     cho ra đúng cao độ. Cache theo hash để KHÔNG chạy CSG mỗi frame — chỉ khi
 *     polygon | height | openings đổi.
 *   - Tường vừa HẾT lỗ (cửa bị xoá): khôi phục mesh đặc bằng rebuildWallMesh.
 *
 * Lưu ý: chỉ cắt mesh thân tường; cap mesh tại junction (cap-${nodeId}) không bị cắt
 * → tránh đặt cửa sát góc giao tường.
 */
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { Mesh } from "src/engine/components/render/Mesh";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { findWallEntity } from "src/engine/adapters/wallRefs";
import { rebuildWallMesh } from "src/engine/systems/wall/wallMeshBuilder";
import { buildCutWallGeo, createWallEvaluator, type OpeningCut } from "src/engine/systems/wall/wallOpeningCutter";
import type { Evaluator } from "three-bvh-csg";
import type { MountWall } from "src/shared/geometry/wallMount";

export class WallOpeningSystem extends System {
    private readonly nodeReg: NodeRegistry;
    /** wallId → hash của lần cắt gần nhất (chỉ chứa tường ĐANG có lỗ). */
    private cutCache = new Map<string, string>();
    /**
     * wallId → instance WallPolygon của lần cắt gần nhất. WallGeometrySystem tạo MỚI
     * instance mỗi khi nó dựng lại mesh đặc (poly bị invalidate khi sửa tường hàng xóm),
     * kể cả khi 4 điểm KHÔNG đổi → hash theo điểm không bắt được. So sánh instance để
     * phát hiện mesh vừa bị dựng đặc và buộc cắt lại (nếu không, lỗ cửa sẽ biến mất).
     */
    private polyRef = new Map<string, WallPolygon>();

    /**
     * revision-guard: world.revision của lần update() vừa chạy — pre-filter rẻ để bỏ qua Query mỗi
     * frame idle. System này KHÔNG mutate world (chỉ swap mesh.geometry) nên revision
     * giữ nguyên qua update; mọi thay đổi opening/polygon (qua handler removeComponent
     * hoặc node markDirty) đều bump revision → guard an toàn. (M1)
     */
    private _lastRevision = -1;

    /** Evaluator CSG sở hữu riêng bởi system (không còn singleton cấp-module). (H2) */
    private readonly evaluator: Evaluator = createWallEvaluator();

    constructor(nodeRegistry: NodeRegistry) {
        super();
        this.nodeReg = nodeRegistry;
    }

    update(world: World): void {
        // Pre-filter idle frame: không có structural change nào kể từ lần chạy trước. (M1)
        if (world.revision === this._lastRevision) return;
        this._lastRevision = world.revision;

        // Gom lỗ theo wallId.
        const byWall = new Map<string, OpeningCut[]>();
        for (const e of Query.entitiesWith(world, WallOpening)) {
            const wo = world.getComponent(e, WallOpening)!;
            let list = byWall.get(wo.hostWallId);
            if (!list) { list = []; byWall.set(wo.hostWallId, list); }
            list.push({ t: wo.t, width: wo.width, height: wo.height, sill: wo.sill });
        }

        // Tường vừa hết lỗ → khôi phục mesh đặc.
        for (const wallId of [...this.cutCache.keys()]) {
            if (!byWall.has(wallId)) {
                this.restoreWall(world, wallId);
                this.cutCache.delete(wallId);
                this.polyRef.delete(wallId);
            }
        }

        // Tường có lỗ → cắt nếu hash đổi.
        for (const [wallId, ops] of byWall) {
            const e = findWallEntity(world, wallId);
            if (e == null) continue;
            const poly = world.getComponent(e, WallPolygon);
            const size = world.getComponent(e, WallSize);
            const meshC = world.getComponent(e, Mesh);
            const wn = world.getComponent(e, WallNodes);
            if (!poly || !size || !meshC || !wn) continue;
            const a = this.nodeReg.get(wn.startNodeId);
            const b = this.nodeReg.get(wn.endNodeId);
            if (!a || !b) continue;

            // Mesh vừa bị WallGeometrySystem dựng lại đặc? (instance WallPolygon đổi)
            // → buộc cắt lại dù hash điểm không đổi.
            const meshRebuilt = this.polyRef.get(wallId) !== poly;
            this.polyRef.set(wallId, poly);

            const hash = this.hash(poly, size.height, ops);
            if (!meshRebuilt && this.cutCache.get(wallId) === hash) continue;

            const wall: MountWall = {
                wallId, ax: a.x, az: a.z, bx: b.x, bz: b.z, thickness: wn.thickness,
            };
            const cutGeo = buildCutWallGeo(poly.points, size.height, wall, ops, this.evaluator);
            meshC.mesh.geometry.dispose();
            meshC.mesh.geometry = cutGeo;
            meshC.mesh.position.set(0, 0, 0);
            meshC.mesh.rotation.set(0, 0, 0);
            this.cutCache.set(wallId, hash);
        }
    }

    /** Dựng lại mesh tường đặc (không lỗ) từ polygon hiện tại. */
    private restoreWall(world: World, wallId: string): void {
        const e = findWallEntity(world, wallId);
        if (e == null) return;
        const poly = world.getComponent(e, WallPolygon);
        const size = world.getComponent(e, WallSize);
        const meshC = world.getComponent(e, Mesh);
        if (!poly || !size || !meshC) return;
        rebuildWallMesh(meshC.mesh, poly.points, size.height, size.height / 2);
    }

    private hash(poly: WallPolygon, height: number, ops: OpeningCut[]): string {
        let h = `h${height.toFixed(3)}`;
        for (const p of poly.points) h += `|${p.x.toFixed(3)},${p.z.toFixed(3)}`;
        // Sắp xếp lỗ theo t để hash ổn định bất kể thứ tự Query.
        const sorted = [...ops].sort((u, v) => u.t - v.t);
        for (const o of sorted) {
            h += `#${o.t.toFixed(4)},${o.width.toFixed(3)},${o.height.toFixed(3)},${o.sill.toFixed(3)}`;
        }
        return h;
    }

    dispose(): void {
        this.cutCache.clear();
        this.polyRef.clear();
    }
}
