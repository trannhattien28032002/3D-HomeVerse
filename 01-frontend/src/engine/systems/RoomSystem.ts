import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { RoomDetection } from "src/engine/graph/RoomDetection";
import { RoomGeometry } from "src/engine/components/RoomGeometry";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";


export class RoomSystem extends System {
    private nodeReg: NodeRegistry;
    private scene: THREE.Scene | null;
    private meshRegistry: MeshRegistry | null;
    private materialRegistry: MaterialRegistry | null;

    private lastHash: string = "";
    private roomEntities = new Map<string, number>();

    constructor(
        nodeReg: NodeRegistry,
        scene?: THREE.Scene,
        meshRegistry?: MeshRegistry,
        materialRegistry?: MaterialRegistry,
    ) {
        super();
        this.nodeReg = nodeReg;
        this.scene = scene ?? null;
        this.meshRegistry = meshRegistry ?? null;
        this.materialRegistry = materialRegistry ?? null;
    }

    update(world: World): void {
        let hash = "";
        for (const node of this.nodeReg.all()) {
            hash += `${node.id}:${node.x.toFixed(2)}:${node.z.toFixed(2)}|${Array.from(node.connectedWallIds).join(',')};`;
        }

        if (hash === this.lastHash) return;
        this.lastHash = hash;

        const detectedRooms = RoomDetection.findRooms(world, this.nodeReg);
        const currentKeys = new Set<string>();

        for (const room of detectedRooms) {
            const sortedNodes = [...room.nodes].sort((a, b) => a - b);
            const key = sortedNodes.join(",");
            currentKeys.add(key);

            let entity = this.roomEntities.get(key);

            if (entity === undefined) {
                entity = world.createEntity();
                this.roomEntities.set(key, entity);
                world.addComponent(entity, new RoomGeometry(room.points, room.area));
            } else {
                const geo = world.getComponent(entity, RoomGeometry);
                if (geo) {
                    geo.points = room.points;
                    geo.area = room.area;
                }
            }

            if (this.scene) {
                this.updateRoomMesh(entity, room.points);
            }
        }

        for (const [key, entity] of this.roomEntities.entries()) {
            if (!currentKeys.has(key)) {
                this.roomEntities.delete(key);
                world.destroyEntity(entity);

                if (this.scene && this.meshRegistry) {
                    this.meshRegistry.dispose(`room-${entity}`);
                }
            }
        }
    }

    private updateRoomMesh(entity: number, points: { x: number; z: number }[]) {
        if (!this.scene || !this.meshRegistry || !this.materialRegistry) return;

        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, -points[0].z);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, -points[i].z);
        }

        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);

        const meshKey = `room-${entity}`;
        const existing = this.meshRegistry.get(meshKey);

        if (!existing) {
            const mat = this.materialRegistry.get({
                color: 0xe2e8f0,
                roughness: 0.9,
                metalness: 0.1,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = -0.01;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.meshRegistry.register(meshKey, mesh);
        } else {
            existing.geometry.dispose();
            existing.geometry = geo;
        }
    }
}
