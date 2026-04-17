import * as THREE from "three";
import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { World } from "../ecs/World";

import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { Selectable } from "../components/Selectable";
import { DynamicBody } from "../components/DynamicBody";
import { StaticBody } from "../components/StaticBody";

import { TransformControls } from "three/addons/controls/TransformControls.js";
// import { EngineEvents } from "../events/EngineEvents";

export class GizmoSystem extends System {
    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private controls: TransformControls;

    private world!: World;
    private draggingEntity: number | null = null;
    private draggingEntityWasStatic: boolean = false;
    private releaseFramesLeft: number = 0;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private pickObjects: THREE.Object3D[] = [];
    // private events: EngineEvents;
    // private lastTransformEmitMs = 0;
    // private readonly transformEmitIntervalMs = 50;

    constructor(
        camera: THREE.Camera,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        orbitControls: any,
        _events?: unknown
    ) {
        super();

        this.camera = camera;
        this.scene = scene;

        this.controls = new TransformControls(camera, renderer.domElement);
        this.controls.setMode("translate");

        this.scene.add(this.controls.getHelper());
        // this.events = events;

        this.controls.addEventListener("dragging-changed", (event: any) => {
            orbitControls.enabled = !event.value;

            const object = this.controls.object;
            const entity = object ? (object as any).__entity : null;

            if (event.value) {
                // Start dragging: make the selected entity dynamic for collision resolving.
                if (entity == null) return;

                this.draggingEntity = entity;
                this.draggingEntityWasStatic = this.world.hasComponent(
                    entity,
                    StaticBody
                );
                this.releaseFramesLeft = 0;

                if (this.draggingEntityWasStatic) {
                    this.world.removeComponent(entity, StaticBody);
                }
                if (!this.world.hasComponent(entity, DynamicBody)) {
                    this.world.addComponent(entity, new DynamicBody());
                }

                // this.events.emit("draggingChanged", { entityId: entity, dragging: true });
                return;
            }

            // Stop dragging: restore original body type.
            if (this.draggingEntity == null) return;
            // IMPORTANT: defer removal a couple frames so collision can clamp the final position
            // even if the user releases while "past" a blocker in a single frame.
            this.releaseFramesLeft = 2;
            // this.events.emit("draggingChanged", { entityId: this.draggingEntity, dragging: false });
        });
        // 🔥 Sync THREE → ECS
        this.controls.addEventListener("objectChange", () => {
            const object = this.controls.object;
            if (!object) return;

            const entity = (object as any).__entity;
            if (entity == null) return;

            const transform = this.world.getComponent(entity, Transform);
            if (!transform) return;

            transform.x = object.position.x;
            transform.y = object.position.y;
            transform.z = object.position.z;
            transform.rotY = object.rotation.y;

            // const now = performance.now();
            // if (now - this.lastTransformEmitMs >= this.transformEmitIntervalMs) {
            //     this.lastTransformEmitMs = now;
            //     this.events.emit("transformChanged", {
            //         entityId: entity,
            //         x: transform.x,
            //         y: transform.y,
            //         z: transform.z,
            //         rotY: transform.rotY
            //     });
            // }
        });

        renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    }

    private onMouseDown = (event: MouseEvent) => {
        const rect = (event.target as HTMLElement).getBoundingClientRect();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const entities = Query.entitiesWith(this.world, Mesh, Selectable);
        const objects = this.pickObjects;
        objects.length = 0;

        for (const e of entities) {
            const meshComp = this.world.getComponent(e, Mesh);
            if (!meshComp) continue;

            const mesh = meshComp.mesh;

            // 🔥 gắn entity vào mesh (QUAN TRỌNG)
            (mesh as any).__entity = e;

            objects.push(mesh);
        }

        const hits = this.raycaster.intersectObjects(objects);

        if (this.controls.dragging) return;

        if (hits.length === 0) {
            this.controls.detach();
            // this.events.emit("selectionChanged", { entityId: null });
            return;
        }

        const mesh = hits[0].object;

        this.controls.attach(mesh);
        // this.events.emit("selectionChanged", { entityId: (mesh as any).__entity ?? null });
    };

    update(world: World): void {
        this.world = world;

        if (this.releaseFramesLeft > 0) {
            this.releaseFramesLeft--;
            if (this.releaseFramesLeft === 0 && this.draggingEntity != null) {
                const e = this.draggingEntity;

                if (this.world.hasComponent(e, DynamicBody)) {
                    this.world.removeComponent(e, DynamicBody);
                }
                if (
                    this.draggingEntityWasStatic &&
                    !this.world.hasComponent(e, StaticBody)
                ) {
                    this.world.addComponent(e, new StaticBody());
                }

                this.draggingEntity = null;
                this.draggingEntityWasStatic = false;
            }
        }
    }
}