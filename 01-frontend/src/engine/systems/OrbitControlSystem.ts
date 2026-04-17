import * as THREE from "three";
import { System } from "../ecs/System";
import { World } from "../ecs/World";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class OrbitControlSystem extends System {
    controls: OrbitControls;

    constructor(
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer
    ) {
        super();

        this.controls = new OrbitControls(camera, renderer.domElement);

        // ⚙️ config cơ bản
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;

        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.controls.enableRotate = true;

        this.controls.minDistance = 2;
        this.controls.maxDistance = 50;

        this.controls.target.set(0, 0, 0);
    }

    update(world: World, deltaTime: number): void {
        this.controls.update();
    }
}