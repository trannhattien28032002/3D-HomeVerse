import * as THREE from "three";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { createWall } from "src/engine/game/WallFactory";

export const INITIAL_NEXT_NODE_ID = 20;
export const INITIAL_NEXT_WALL_ID = 10;

type NodeDef = { id: number; x: number; z: number };
type WallDef = { wallId: number; startNodeId: number; endNodeId: number; thickness: number };

const DEFAULT_NODE_DEFS: NodeDef[] = [
    { id: 1, x: 6,  z: -5 },
    { id: 2, x: 6,  z: 5  },
    { id: 3, x: -6, z: -5 },
    { id: 4, x: -6, z: 5  },
    { id: 6, x: -5, z: -6 },
    { id: 7, x: 5,  z: -6 },
];

const DEFAULT_WALL_DEFS: WallDef[] = [
    { wallId: 1, startNodeId: 1, endNodeId: 2, thickness: 1 },
    { wallId: 2, startNodeId: 3, endNodeId: 4, thickness: 1 },
    { wallId: 3, startNodeId: 6, endNodeId: 7, thickness: 1 },
];

export function initDefaultScene(
    world: World,
    scene: THREE.Scene,
    nodeRegistry: NodeRegistry,
    wallEntityByWallId: Map<number, number>,
): void {
    for (const nd of DEFAULT_NODE_DEFS) {
        nodeRegistry.ensureNode(nd.id, nd.x, nd.z);
    }

    for (const def of DEFAULT_WALL_DEFS) {
        const sn = nodeRegistry.getOrThrow(def.startNodeId);
        const en = nodeRegistry.getOrThrow(def.endNodeId);
        const dx = en.x - sn.x, dz = en.z - sn.z;
        const length = Math.hypot(dx, dz);
        const cx = (sn.x + en.x) / 2;
        const cz = (sn.z + en.z) / 2;

        const entity = createWall(world, scene, {
            wallId: def.wallId,
            startNodeId: def.startNodeId,
            endNodeId: def.endNodeId,
            cx, cy: 0.5, cz,
            length,
            height: 1,
            thickness: def.thickness,
        });

        nodeRegistry.connectWall(def.startNodeId, def.wallId);
        nodeRegistry.connectWall(def.endNodeId, def.wallId);
        wallEntityByWallId.set(def.wallId, entity);
    }
}
