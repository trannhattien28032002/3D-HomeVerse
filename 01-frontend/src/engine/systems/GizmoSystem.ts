import * as THREE from "three";
import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { World } from "../ecs/World";

import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { Selectable } from "../components/Selectable";
import { DynamicBody } from "../components/DynamicBody";
import { StaticBody } from "../components/StaticBody";
import { WallTag } from "../components/WallTag";
import { WallNodes } from "../components/WallNodes";

import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EngineEvents } from "../events/EngineEvents";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type MeshWithEntity = THREE.Object3D & { __entity?: number };

export class GizmoSystem extends System {
    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private controls: TransformControls;
    private rendererDomElement: HTMLCanvasElement;

    private world!: World;
    private draggingEntity: number | null = null;
    private draggingEntityWasStatic: boolean = false;
    private releaseFramesLeft: number = 0;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private pickObjects: THREE.Object3D[] = [];
    private events?: EngineEvents;

    constructor(
        camera: THREE.Camera,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        orbitControls: OrbitControls,
        events?: EngineEvents
    ) {
        super();

        this.camera = camera;
        this.scene = scene;
        this.rendererDomElement = renderer.domElement;

        this.controls = new TransformControls(camera, renderer.domElement);
        this.controls.setMode("translate");

        this.scene.add(this.controls.getHelper());
        this.events = events;

        this.controls.addEventListener("dragging-changed", (event) => {
            const isDragging = Boolean(event.value);
            orbitControls.enabled = !isDragging;

            const object = this.controls.object;
            const entity = object ? (object as MeshWithEntity).__entity ?? null : null;

            if (isDragging) {
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

                this.events?.emit("draggingChanged", { entityId: entity, dragging: true });
                return;
            }

            if (this.draggingEntity == null) return;
            this.releaseFramesLeft = 2;
            this.events?.emit("draggingChanged", { entityId: this.draggingEntity, dragging: false });
        });
        
        this.controls.addEventListener("objectChange", () => {
            const object = this.controls.object;

            if (!object) return;

            const entity = (object as MeshWithEntity).__entity;
            if (entity == null) return;

            const transform = this.world.getComponent(entity, Transform);
            const wallTag = this.world.getComponent(entity, WallTag);

            if (!transform) return;

            transform.x = object.position.x;
            transform.y = object.position.y;
            transform.z = object.position.z;
            transform.rotY = object.rotation.y;

            void wallTag; 
        });

        this.rendererDomElement.addEventListener("mousedown", this.onMouseDown);
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
            if (this.world.hasComponent(e, WallNodes)) continue;

            const meshComp = this.world.getComponent(e, Mesh);
            if (!meshComp) continue;

            const mesh = meshComp.mesh;
            (mesh as MeshWithEntity).__entity = e;
            objects.push(mesh);
        }

        const hits = this.raycaster.intersectObjects(objects);

        if (this.controls.dragging) return;

        if (hits.length === 0) {
            this.controls.detach();
            this.events?.emit("entitySelected", { entityId: null });
            return;
        }

        const mesh = hits[0].object;

        this.controls.attach(mesh);
        this.events?.emit("entitySelected", { entityId: (mesh as MeshWithEntity).__entity ?? null });
    };

    dispose() {
        this.rendererDomElement.removeEventListener("mousedown", this.onMouseDown);
        this.controls.detach();
        this.scene.remove(this.controls.getHelper());
        this.controls.dispose();
    }

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
