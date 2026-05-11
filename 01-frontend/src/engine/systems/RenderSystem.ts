import * as THREE from "three";

import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { WallNodes } from "../components/WallNodes";
import { World } from "../ecs/World";

export class RenderSystem extends System {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.Camera;

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
    ) {
        super();
        this.renderer = renderer;
        this.scene    = scene;
        this.camera   = camera;
    }

    update(world: World, deltaTime: number): void {
        void deltaTime;
        const entities = Query.entitiesWith(world, Transform, Mesh);

        for (const entity of entities) {
            const transform  = world.getComponent(entity, Transform)!;
            const meshComp   = world.getComponent(entity, Mesh)!;
            const mesh       = meshComp.mesh;
            const isWall     = world.hasComponent(entity, WallNodes);

            if (isWall) {
                mesh.position.set(0, transform.y, 0);
                mesh.rotation.set(0, 0, 0);
            } else {
                mesh.position.set(transform.x, transform.y, transform.z);
                mesh.rotation.y = transform.rotY;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}
