import * as THREE from "three";

import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { World } from "../ecs/World";

/**
 * Cập nhật vị trí của lưới 3D (Mesh) trong Three.js để khớp với
 * dữ liệu tọa độ (Transform) quản lý bởi ECS.
 */
export class RenderSystem extends System {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.Camera;

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera
    ) {
        super();
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
    }

    update(world: World, deltaTime: number): void {
        void deltaTime;
        const entities = Query.entitiesWith(world, Transform, Mesh);

        for (const entity of entities) {
            const transform = world.getComponent(entity, Transform);
            const meshComponent = world.getComponent(entity, Mesh);

            if (!transform || !meshComponent) continue;

            const mesh = meshComponent.mesh;

            // rotation
            mesh.rotation.y = transform.rotY;

            // position
            mesh.position.set(
                transform.x,
                transform.y,
                transform.z
            );
        }

        this.renderer.render(this.scene, this.camera);
    }
}
