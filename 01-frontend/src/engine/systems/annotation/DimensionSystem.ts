/**
 * DimensionSystem — tính toán annotations kích thước cho PlanView2D.
 *
 * Chạy mỗi frame, trước SnapshotSystem.
 * Kết quả được lưu vào public property (không emit event riêng) để
 * SnapshotSystem đọc và đóng gói vào ECSSnapshot.
 *
 * Output:
 *   lastDimensions:      DimensionSnapshot[] — độ dài từng tường (mm label)
 *   lastAngleDimensions: AngleDimensionSnapshot[] — góc giữa các tường tại node
 *
 * Thuật toán angle dimension:
 *   Với mỗi node có ≥ 2 tường:
 *     1. Build direction vector từ node ra mỗi tường (outward)
 *     2. Sắp xếp radially theo angle
 *     3. Tính sweep (góc quét CW) giữa mỗi cặp liền kề
 *     4. Chỉ emit các góc trong [5°, 175°] — bỏ qua reflex và degenerate
 *     5. Tính bisector vector (cho label placement)
 */
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { DimensionSnapshot, AngleDimensionSnapshot } from "src/engine/events/EngineEvents";

export class DimensionSystem extends System {
    /** Kết quả tính chiều dài — SnapshotSystem đọc sau khi update() chạy xong. */
    public lastDimensions: DimensionSnapshot[] = [];
    /** Kết quả tính góc — SnapshotSystem đọc sau khi update() chạy xong. */
    public lastAngleDimensions: AngleDimensionSnapshot[] = [];
    private readonly nodes: NodeRegistry;

    /**
     * revision-guard: World.revision đã tính lần cuối — bỏ qua frame idle.
     * System này KHÔNG mutate world (chỉ đọc + ghi public property), nên khi
     * revision không đổi, lastDimensions/lastAngleDimensions trước đó vẫn hợp lệ.
     * SnapshotSystem chạy sau với cùng revision-guard nên đọc lại giá trị cũ an toàn.
     */
    private _lastRevision = -1;

    constructor(nodes: NodeRegistry) {
        super();
        this.nodes = nodes;
    }

    update(world: World): void {
        // Pre-filter idle frame: không có structural change nào kể từ lần chạy trước. (HG-01)
        if (world.revision === this._lastRevision) return;

        const entities = Query.entitiesWith(world, WallTag, WallNodes);
        const dims: DimensionSnapshot[] = [];
        // wallId → hai node đầu/cuối, cần cho phép tính góc bên dưới
        const wallNodeMap = new Map<string, { startNodeId: string; endNodeId: string }>();

        for (const e of entities) {
            const tag = world.getComponent(e, WallTag)!;
            const wn = world.getComponent(e, WallNodes)!;
            const sn = this.nodes.get(wn.startNodeId);
            const en = this.nodes.get(wn.endNodeId);
            if (!sn || !en) continue;

            const dx = en.x - sn.x;
            const dz = en.z - sn.z;
            const length = Math.hypot(dx, dz);
            if (length < 0.01) continue;

            const ux = dx / length;
            const uz = dz / length;

            dims.push({
                wallId: tag.wallId,
                length,
                startX: sn.x, startZ: sn.z,
                endX: en.x, endZ: en.z,
                perpX: -uz, perpZ: ux,
            });
            wallNodeMap.set(tag.wallId, { startNodeId: wn.startNodeId, endNodeId: wn.endNodeId });
        }

        this.lastDimensions = dims;
        this.lastAngleDimensions = this.computeAngleDimensions(wallNodeMap);

        // Lưu revision SAU khi tính xong (system không bump revision). (HG-01)
        this._lastRevision = world.revision;
    }

    private computeAngleDimensions(
        wallNodeMap: Map<string, { startNodeId: string; endNodeId: string }>,
    ): AngleDimensionSnapshot[] {
        const result: AngleDimensionSnapshot[] = [];

        for (const node of this.nodes.all()) {
            const wallIds = Array.from(node.connectedWallIds);
            if (wallIds.length < 2) continue;

            // Dựng vector hướng từ node này ra ngoài dọc theo từng tường
            type Dir = { wallId: string; ux: number; uz: number; angle: number };
            const dirs: Dir[] = [];

            for (const wallId of wallIds) {
                const wn = wallNodeMap.get(wallId);
                if (!wn) continue;
                const otherId = wn.startNodeId === node.id ? wn.endNodeId : wn.startNodeId;
                const other = this.nodes.get(otherId);
                if (!other) continue;
                const dx = other.x - node.x;
                const dz = other.z - node.z;
                const len = Math.hypot(dx, dz);
                if (len < 0.001) continue;
                dirs.push({ wallId, ux: dx / len, uz: dz / len, angle: Math.atan2(dz, dx) });
            }

            if (dirs.length < 2) continue;
            dirs.sort((a, b) => a.angle - b.angle);

            // Mỗi cặp liền kề (theo thứ tự CW đã sort) phát ra một cung góc
            for (let i = 0; i < dirs.length; i++) {
                const d1 = dirs[i];
                const d2 = dirs[(i + 1) % dirs.length];

                // Quét từ d1 sang d2 theo CW; xử lý wrap-around cho cặp cuối
                let sweep = (d2.angle - d1.angle) * (180 / Math.PI);
                if (sweep < 0) sweep += 360;

                // Chỉ hiện góc trong khoảng có nghĩa; bỏ qua góc phản (reflex) và suy biến
                if (sweep < 5 || sweep > 175) continue;

                // Phân giác (trung bình 2 vector đơn vị, đã chuẩn hoá)
                const bx = d1.ux + d2.ux;
                const bz = d1.uz + d2.uz;
                const bLen = Math.hypot(bx, bz);

                result.push({
                    nodeId: node.id,
                    wallId1: d1.wallId,
                    wallId2: d2.wallId,
                    angle: sweep,
                    startAngle: d1.angle * (180 / Math.PI),
                    sweepAngle: sweep,
                    cornerX: node.x,
                    cornerZ: node.z,
                    bisectorX: bLen > 0.001 ? bx / bLen : 0,
                    bisectorZ: bLen > 0.001 ? bz / bLen : 0,
                });
            }
        }

        return result;
    }
}
