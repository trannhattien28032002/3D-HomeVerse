/**
 * SnapshotSystem — cầu nối giữa ECS và React UI.
 *
 * Chạy mỗi frame (sau WallGeometrySystem và DimensionSystem).
 * Thu thập trạng thái scene và emit event "snapshot" nếu có thay đổi.
 *
 * Input:  ECS World (wall entities) + NodeRegistry + DimensionSystem.lastDimensions
 * Output: ECSSnapshot emit qua EngineEvents → useFloorPlanSnapshot → PlanView2D re-render
 *
 * Change detection:
 *   Reads World.revision — incremented by every structural ECS mutation.
 *   If revision matches _lastRevision, skips the entire build and emit (O(1) per frame when idle).
 *
 * Pipeline vị trí trong system order:
 *   WallGeometrySystem → DimensionSystem → SnapshotSystem → RenderSystem
 */
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { WallTag } from "src/engine/components/wall/WallTag";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { Transform } from "src/engine/components/core/Transform";
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { DimensionSystem } from "src/engine/systems/annotation/DimensionSystem";
import { getTopDownUrl } from "src/engine/catalog/FurnitureCatalog";
import { getEntityFootprint2D } from "src/engine/catalog/footprint";
import { findOverlappingWallItems, type WallItemForOverlap } from "src/engine/utils/wallOccupancy";

import { EngineEvents, type ECSSnapshot, type NodeSnapshot, type WallSnapshot, type NodeCapSnapshot, type RoomSnapshot, type FurnitureSnapshot } from "src/engine/events/EngineEvents";

export class SnapshotSystem extends System {
    private readonly events: EngineEvents;
    private readonly nodes: NodeRegistry;
    /** Tham chiếu DimensionSystem để lấy lastDimensions sau khi system kia chạy xong. */
    private readonly dimSystem: DimensionSystem;
    /** World.revision của snapshot phát gần nhất — bỏ qua rebuild khi không đổi. R9: number (từ int counter). */
    private _lastRevision: number = -1;

    constructor(events: EngineEvents, nodes: NodeRegistry, dimSystem: DimensionSystem) {
        super();
        this.events = events;
        this.nodes = nodes;
        this.dimSystem = dimSystem;
    }

    update(world: World): void {
        if (world.revision === this._lastRevision) return;

        const entities = Query.entitiesWith(world, WallTag, WallNodes, WallSize, Transform);

        const walls: WallSnapshot[] = [];
        /** hostWallId → chiều dài tim tường (mét) — để detect overlap wall-item. */
        const wallLengths = new Map<string, number>();
        for (const e of entities) {
            const tag = world.getComponent(e, WallTag)!;
            const wn = world.getComponent(e, WallNodes)!;
            const size = world.getComponent(e, WallSize)!;
            const t = world.getComponent(e, Transform)!;
            const poly = world.getComponent(e, WallPolygon);

            const sNode = this.nodes.get(wn.startNodeId);
            const eNode = this.nodes.get(wn.endNodeId);
            if (sNode && eNode) {
                wallLengths.set(tag.wallId, Math.hypot(sNode.x - eNode.x, sNode.z - eNode.z));
            }

            walls.push({
                wallId: tag.wallId,
                startNodeId: wn.startNodeId,
                endNodeId: wn.endNodeId,
                thickness: wn.thickness,
                height: size.height,
                cx: t.x,
                cz: t.z,
                polygon: poly ? poly.points.map(p => ({ x: p.x, z: p.z })) : undefined,
            });
        }

        const nodeSnapshots: NodeSnapshot[] = [];
        for (const n of this.nodes.all()) {
            nodeSnapshots.push({ id: n.id, x: n.x, z: n.z });
        }

        const caps: NodeCapSnapshot[] = [];
        for (const [nodeId, pts] of this.nodes.nodeCaps) {
            caps.push({ nodeId, polygon: pts });
        }

        this._lastRevision = world.revision;

        const rooms: RoomSnapshot[] = [];
        const roomEntities = Query.entitiesWith(world, RoomGeometry);
        for (const e of roomEntities) {
            const geo = world.getComponent(e, RoomGeometry)!;
            rooms.push({
                id: `room-${e}`,
                key: geo.key,
                area: geo.area,
                polygon: geo.points.map(p => ({ x: p.x, z: p.z }))
            });
        }

        const furniture: FurnitureSnapshot[] = [];
        // Gom song song input + entry để detect overlap INLINE (tránh filter+map mảng trung gian).
        const wallItemEntries: FurnitureSnapshot[] = [];
        const wallItemInputs: WallItemForOverlap[] = [];
        const furnitureEntities = Query.entitiesWith(world, FurnitureTag, Transform);
        for (const e of furnitureEntities) {
            const tag = world.getComponent(e, FurnitureTag)!;
            const t = world.getComponent(e, Transform)!;
            // Single source: getEntityFootprint2D đọc live ColliderAABB (đã set ở spawn-time
            // bằng priority chain — tier 1 _col mesh / 2 JSON / 3 visual AABB), fallback catalog.
            const fp = getEntityFootprint2D(world, e, tag.modelId);
            const entry: FurnitureSnapshot = {
                entityId: e,
                modelId: tag.modelId,
                x: t.x,
                z: t.z,
                rotY: t.rotY,
                width: fp.width,
                depth: fp.depth,
                topDownUrl: getTopDownUrl(tag.modelId),
            };

            const wallOpening = world.getComponent(e, WallOpening);
            const wallMounted = world.getComponent(e, WallMounted);
            if (wallOpening) {
                entry.isWallItem = true;
                entry.wallBehavior = "opening";
                entry.hostWallId = wallOpening.hostWallId;
                entry.wallT = wallOpening.t;
                entry.wallSide = wallOpening.side;
                entry.cutWidth = wallOpening.width;
                entry.cutHeight = wallOpening.height;
                entry.sill = wallOpening.sill;
                wallItemEntries.push(entry);
                wallItemInputs.push({ hostWallId: wallOpening.hostWallId, t: wallOpening.t, width: wallOpening.width, behavior: "opening", side: wallOpening.side });
            } else if (wallMounted) {
                entry.isWallItem = true;
                entry.wallBehavior = "mount";
                entry.hostWallId = wallMounted.hostWallId;
                entry.wallT = wallMounted.t;
                entry.wallSide = wallMounted.side;
                wallItemEntries.push(entry);
                wallItemInputs.push({ hostWallId: wallMounted.hostWallId, t: wallMounted.t, width: fp.width, behavior: "mount", side: wallMounted.side });
            }

            furniture.push(entry);
        }

        // Flag overlap wall-item (derived, cùng quy tắc lane/overlap với placement & drag)
        // — chạy SAU mọi reconcile (resize/merge) nên invariant "không chồng" được soi liên tục.
        if (wallItemInputs.length > 1) {
            const overlapIdx = findOverlappingWallItems(wallItemInputs, wallLengths);
            overlapIdx.forEach((k) => { wallItemEntries[k].overlapping = true; });
        }

        const snapshot: ECSSnapshot = {
            nodes: nodeSnapshots,
            walls,
            caps,
            rooms,
            dimensions: this.dimSystem.lastDimensions,
            angleDimensions: this.dimSystem.lastAngleDimensions,
            furniture
        };

        this.events.emit("snapshot", snapshot);
    }
}
