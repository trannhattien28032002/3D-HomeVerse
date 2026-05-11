import * as THREE from "three";
import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { NodeRegistry } from "../graph/NodeRegistry";
import { RoomDetection } from "../graph/RoomDetection";
import { RoomGeometry } from "../components/RoomGeometry";


export class RoomSystem extends System {
    private nodeReg: NodeRegistry;
    private scene: THREE.Scene | null;
    
    private lastHash: string = "";
    
    private roomEntities = new Map<string, number>(); 
    private roomMeshes = new Map<number, THREE.Mesh>(); 

    private floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xe2e8f0, // Light gray
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    constructor(nodeReg: NodeRegistry, scene?: THREE.Scene) {
        super();
        this.nodeReg = nodeReg;
        this.scene = scene || null;
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
                
                if (this.scene) {
                    const mesh = this.roomMeshes.get(entity);
                    if (mesh) {
                        this.scene.remove(mesh);
                        mesh.geometry.dispose();
                        this.roomMeshes.delete(entity);
                    }
                }
            }
        }
    }

    private updateRoomMesh(entity: number, points: {x: number, z: number}[]) {
        if (!this.scene) return;

        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, -points[0].z);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, -points[i].z);
        }

        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);

        let mesh = this.roomMeshes.get(entity);
        if (!mesh) {
            mesh = new THREE.Mesh(geo, this.floorMat);
            mesh.position.y = -0.01;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.roomMeshes.set(entity, mesh);
        } else {
            mesh.geometry.dispose();
            mesh.geometry = geo;
        }
    }
}
