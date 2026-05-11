import * as THREE from "three";
import { System } from "../ecs/System";
import { World } from "../ecs/World";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Professional 3D Design Tool Navigation System.
 * Replaces default viewer behavior with ground-constrained, cursor-based zoom and smart panning.
 */
export class OrbitControlSystem extends System {
    controls: OrbitControls;

    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private domElement: HTMLElement;

    private zoomDelta = 0;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    private focusPoint: THREE.Vector3 | null = null;

    constructor(
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene
    ) {
        super();
        this.camera = camera;
        this.scene = scene;
        this.domElement = renderer.domElement;

        this.controls = new OrbitControls(camera, renderer.domElement);

        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

        this.controls.screenSpacePanning = false;

        this.controls.enableZoom = false;

        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 2000;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.controls.target.set(0, 0, 0);

        this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
        this.domElement.addEventListener("mousemove", this.onMouseMove);
        this.domElement.addEventListener("dblclick", this.onDoubleClick);
    }

    private onMouseMove = (event: MouseEvent) => {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    private onWheel = (event: WheelEvent) => {
        event.preventDefault();

        this.zoomDelta -= event.deltaY * 0.001;

        this.zoomDelta = Math.max(-0.5, Math.min(0.5, this.zoomDelta));

        this.focusPoint = null;
    };

    private onDoubleClick = () => {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.scene.children, true);

        let hitPoint: THREE.Vector3 | undefined;
        for (const hit of hits) {
            if (hit.object.type === "Mesh" && hit.object.visible) {
                hitPoint = hit.point;
                break;
            }
        }

        if (!hitPoint) {
            hitPoint = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
        }

        if (hitPoint) {
            this.focusPoint = hitPoint.clone();
            this.zoomDelta = 0;
        }
    };

    dispose() {
        this.domElement.removeEventListener("wheel", this.onWheel);
        this.domElement.removeEventListener("mousemove", this.onMouseMove);
        this.domElement.removeEventListener("dblclick", this.onDoubleClick);
        this.controls.dispose();
    }

    update(world: World, deltaTime: number): void {
        void world;
        void deltaTime;

        if (Math.abs(this.zoomDelta) > 0.0001) {
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const hits = this.raycaster.intersectObjects(this.scene.children, true);
            let hitPoint = hits.find(h => h.object.type === "Mesh" && h.object.visible)?.point;

            if (!hitPoint) {
                hitPoint = new THREE.Vector3();
                this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
            }

            if (hitPoint) {
                const targetWorld = hitPoint.clone();

                const MAX_ZOOM_DIST = this.controls.target.distanceTo(this.camera.position) * 3;
                const distToHit = this.camera.position.distanceTo(targetWorld);

                if (distToHit > MAX_ZOOM_DIST) {
                    const dir = new THREE.Vector3().subVectors(targetWorld, this.camera.position).normalize();
                    targetWorld.copy(this.camera.position).addScaledVector(dir, MAX_ZOOM_DIST);
                }

                const zoomStep = this.zoomDelta * 0.15;

                const camToTarget = new THREE.Vector3().subVectors(targetWorld, this.camera.position);
                const focusToTarget = new THREE.Vector3().subVectors(targetWorld, this.controls.target);

                this.camera.position.addScaledVector(camToTarget, zoomStep);
                this.controls.target.addScaledVector(focusToTarget, zoomStep);
            }

            this.zoomDelta *= 0.8;
        }

        if (this.focusPoint) {
            const dist = this.controls.target.distanceTo(this.focusPoint);
            if (dist > 0.01) {
                this.controls.target.lerp(this.focusPoint, 0.1);
            } else {
                this.controls.target.copy(this.focusPoint);
                this.focusPoint = null;
            }
        }

        this.controls.update();
    }
}
