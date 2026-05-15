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
import { WallTag } from "src/engine/components/WallTag";
import { WallNodes } from "src/engine/components/WallNodes";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { DimensionSnapshot, AngleDimensionSnapshot } from "src/engine/events/EngineEvents";

export class DimensionSystem extends System {
    /** Kết quả tính chiều dài — SnapshotSystem đọc sau khi update() chạy xong. */
    public lastDimensions: DimensionSnapshot[] = [];
    /** Kết quả tính góc — SnapshotSystem đọc sau khi update() chạy xong. */
    public lastAngleDimensions: AngleDimensionSnapshot[] = [];
    private readonly nodes: NodeRegistry;

    constructor(nodes: NodeRegistry) {
        super();
        this.nodes = nodes;
    }

    update(world: World): void {
        const entities = Query.entitiesWith(world, WallTag, WallNodes);
        const dims: DimensionSnapshot[] = [];
        // wallId → node endpoints, needed for angle computation below
        const wallNodeMap = new Map<number, { startNodeId: number; endNodeId: number }>();

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
    }

    private computeAngleDimensions(
        wallNodeMap: Map<number, { startNodeId: number; endNodeId: number }>,
    ): AngleDimensionSnapshot[] {
        const result: AngleDimensionSnapshot[] = [];

        for (const node of this.nodes.all()) {
            const wallIds = Array.from(node.connectedWallIds);
            if (wallIds.length < 2) continue;

            // Build direction vectors from this node outward along each wall
            type Dir = { wallId: number; ux: number; uz: number; angle: number };
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

            // Emit one arc per adjacent pair in sorted (CW) order
            for (let i = 0; i < dirs.length; i++) {
                const d1 = dirs[i];
                const d2 = dirs[(i + 1) % dirs.length];

                // Sweep from d1 to d2 going CW; handle wrap-around for the last pair
                let sweep = (d2.angle - d1.angle) * (180 / Math.PI);
                if (sweep < 0) sweep += 360;

                // Only show angles in a meaningful range; skip reflex and degenerate
                if (sweep < 5 || sweep > 175) continue;

                // Bisector (average of the two unit vectors, normalized)
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
