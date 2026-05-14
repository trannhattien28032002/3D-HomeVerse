import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { WallTag } from "src/engine/components/WallTag";
import { WallSize } from "src/engine/components/WallSize";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { Transform } from "src/engine/components/Transform";
import { RoomGeometry } from "src/engine/components/RoomGeometry";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { DimensionSystem } from "src/engine/systems/DimensionSystem";

import { EngineEvents, type ECSSnapshot, type NodeSnapshot, type WallSnapshot, type NodeCapSnapshot, type RoomSnapshot } from "src/engine/events/EngineEvents";

export class SnapshotSystem extends System {
    private readonly events: EngineEvents;
    private readonly nodes: NodeRegistry;
    private readonly dimSystem: DimensionSystem;
    private lastHash = "";

    constructor(events: EngineEvents, nodes: NodeRegistry, dimSystem: DimensionSystem) {
        super();
        this.events = events;
        this.nodes = nodes;
        this.dimSystem = dimSystem;
    }

    update(world: World): void {
        const entities = Query.entitiesWith(world, WallTag, WallNodes, WallSize, Transform);

        const walls: WallSnapshot[] = [];
        for (const e of entities) {
            const tag = world.getComponent(e, WallTag)!;
            const wn = world.getComponent(e, WallNodes)!;
            const size = world.getComponent(e, WallSize)!;
            const t = world.getComponent(e, Transform)!;
            const poly = world.getComponent(e, WallPolygon);

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

        const wallHash = walls
            .map(w =>
                `${w.wallId}:n${w.startNodeId}-n${w.endNodeId}|t${w.thickness.toFixed(3)}|h${w.height.toFixed(3)}|cx${w.cx.toFixed(3)},${w.cz.toFixed(3)}` +
                (w.polygon ? `|poly${w.polygon.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(";")}` : "")
            )
            .join("|");

        const nodeHash = nodeSnapshots
            .map(n => `${n.id}:${n.x.toFixed(4)},${n.z.toFixed(4)}`)
            .join("|");

        const caps: NodeCapSnapshot[] = [];
        for (const [nodeId, pts] of this.nodes.nodeCaps) {
            caps.push({ nodeId, polygon: pts });
        }

        const capHash = caps
            .map(c => `cap${c.nodeId}:${c.polygon.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(";")}`)
            .join("|");

        const hash = wallHash + "##" + nodeHash + "##" + capHash;
        if (hash === this.lastHash) return;
        this.lastHash = hash;

        const rooms: RoomSnapshot[] = [];
        const roomEntities = Query.entitiesWith(world, RoomGeometry);
        for (const e of roomEntities) {
            const geo = world.getComponent(e, RoomGeometry)!;
            rooms.push({
                id: `room-${e}`,
                area: geo.area,
                polygon: geo.points.map(p => ({ x: p.x, z: p.z }))
            });
        }

        const snapshot: ECSSnapshot = { nodes: nodeSnapshots, walls, caps, rooms, dimensions: this.dimSystem.lastDimensions, angleDimensions: this.dimSystem.lastAngleDimensions };
        this.events.emit("snapshot", snapshot);
    }
}
