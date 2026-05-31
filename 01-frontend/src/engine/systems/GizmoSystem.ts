import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";

import { Transform } from "src/engine/components/Transform";
import { DynamicBody } from "src/engine/components/DynamicBody";
import { StaticBody } from "src/engine/components/StaticBody";
import { Model3D } from "src/engine/components/Model3D";
import { ColliderAABB } from "src/engine/components/ColliderAABB";

import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CannonCollisionSystem } from "src/engine/systems/CannonCollisionSystem";
import { DragGhostController } from "src/engine/systems/DragGhostController";
import {
    type MeshWithEntity,
    collectPickTargets,
    resolveHitEntity,
    applyRotateCheck,
} from "src/engine/systems/gizmoHandles";

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
    private collisionSystem: CannonCollisionSystem;
    private dragGhostController: DragGhostController;
    private currentMode: "translate" | "rotate" = "translate";

    private onBeginTransaction: ((label: string) => void) | null = null;
    private onCommitTransaction: (() => void) | null = null;
    private onDeleteEntity: ((entityId: number) => void) | null = null;

    setCommandCallbacks(
        beginTransaction: (label: string) => void,
        commitTransaction: () => void,
        deleteEntity: (entityId: number) => void,
    ): void {
        this.onBeginTransaction = beginTransaction;
        this.onCommitTransaction = commitTransaction;
        this.onDeleteEntity = deleteEntity;
    }

    constructor(
        camera: THREE.Camera,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        orbitControls: OrbitControls,
        events?: EngineEvents,
        collisionSystem?: CannonCollisionSystem,
        dragGhostController?: DragGhostController,
    ) {
        super();

        this.camera = camera;
        this.scene = scene;
        this.rendererDomElement = renderer.domElement;

        this.controls = new TransformControls(camera, renderer.domElement);
        this.controls.setMode("translate");

        this.scene.add(this.controls.getHelper());
        this.events = events;
        this.collisionSystem = collisionSystem!;
        this.dragGhostController = dragGhostController!;

        this.controls.addEventListener("dragging-changed", (event) => {
            const isDragging = Boolean(event.value);
            orbitControls.enabled = !isDragging;

            const object = this.controls.object;
            const entity = object ? (object as MeshWithEntity).__entity ?? null : null;

            if (isDragging) {
                if (entity == null) return;

                const label = this.currentMode === "rotate"
                    ? "rotate furniture 3D"
                    : "move furniture 3D";
                this.onBeginTransaction?.(label);

                this.draggingEntity = entity;
                this.draggingEntityWasStatic = this.world.hasComponent(entity, StaticBody);
                this.releaseFramesLeft = 0;

                if (this.draggingEntityWasStatic) {
                    this.world.removeComponent(entity, StaticBody);
                }
                if (!this.world.hasComponent(entity, DynamicBody)) {
                    this.world.addComponent(entity, new DynamicBody());
                }

                // Rotate mode uses no ghost — the object is spinning in place.
                if (this.currentMode === "translate") {
                    this.dragGhostController?.begin(this.world, entity);
                }
                this.events?.emit("draggingChanged", { entityId: entity, dragging: true });
                return;
            }

            if (this.draggingEntity == null) return;
            // Ghost was never started in rotate mode — only clean up in translate.
            if (this.currentMode === "translate") {
                this.dragGhostController?.end();
            }
            this.onCommitTransaction?.();
            this.releaseFramesLeft = 2;
            this.events?.emit("draggingChanged", { entityId: this.draggingEntity, dragging: false });
        });

        this.controls.addEventListener("objectChange", () => {
            const object = this.controls.object;
            if (!object) return;

            const entity = (object as MeshWithEntity).__entity;
            if (entity == null) return;

            const transform = this.world.getComponent(entity, Transform);
            if (!transform) return;

            const ix = object.position.x;
            const iy = object.position.y;
            const iz = object.position.z;
            // Full quaternion — preserves pitch/roll without gimbal-fold issues.
            const q = object.quaternion;

            // GLB furniture: object.position.y is the mesh bottom (pivot normalised to 0
            // at base), but Transform.y / collision space use AABB centre.
            // ColliderAABB.height is a half-extent (see CannonCollisionSystem prepareProbe).
            const collider = this.world.getComponent(entity, ColliderAABB);
            const isModel3D = this.world.hasComponent(entity, Model3D);
            const halfH = (isModel3D && collider) ? collider.height : 0;
            // AABB-centre Y used for all collision/transform writes.
            const adjustedY = iy + halfH;

            // Rotate mode: check rotated OBB footprint; block if it overlaps anything.
            if (this.currentMode === "rotate") {
                applyRotateCheck(this.controls, transform, collider ?? null, this.collisionSystem, entity, this.world);
                return;
            }

            const intendedCollides = this.collisionSystem.wouldCollide(this.world, entity, ix, adjustedY, iz);

            if (!intendedCollides) {
                // Intended position is clear — object teleports to cursor.
                transform.x = ix;
                transform.y = adjustedY;
                transform.z = iz;
                this.collisionSystem.setSafePos(entity, ix, adjustedY, iz);
                this.dragGhostController?.hide();
            } else {
                // Intended position collides — stop object at wall, ghost floats at cursor.
                const clamped = this.collisionSystem.clampMovement(this.world, entity, ix, adjustedY, iz);
                if (clamped) {
                    // clamped.y is AABB-centre; write to transform in centre space.
                    transform.x = clamped.x;
                    transform.y = clamped.y;
                    transform.z = clamped.z;
                    // Convert AABB-centre back to mesh-bottom for Three.js object.
                    object.position.set(clamped.x, clamped.y - halfH, clamped.z);
                } else {
                    transform.x = ix;
                    transform.y = adjustedY;
                    transform.z = iz;
                }
                // Ghost clones the visual root which sits at mesh-bottom, so pass iy (not
                // adjustedY) for the ghost's Y so it renders flush with the floor.
                this.dragGhostController?.update({ x: ix, y: iy, z: iz, qx: q.x, qy: q.y, qz: q.z, qw: q.w }, true);
            }

            transform.setQuaternion(q.x, q.y, q.z, q.w);
            // Bump revision so SnapshotSystem rebuilds and the 2D box follows in sync.
            this.world.markDirty();
        });

        this.rendererDomElement.addEventListener("mousedown", this.onMouseDown);
        window.addEventListener("keydown", this.onKeyDown);
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        const object = this.controls.object;
        if (!object) return;
        const entity = (object as MeshWithEntity).__entity ?? null;
        if (entity == null) return;
        this.onDeleteEntity?.(entity);
        this.controls.detach();
        this.events?.emit("entitySelected", { entityId: null });
    };

    private onMouseDown = (event: MouseEvent) => {
        const rect = (event.target as HTMLElement).getBoundingClientRect();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        collectPickTargets(this.world, this.pickObjects);
        // recursive=true so Three.js can hit child meshes inside GLB Groups
        const hits = this.raycaster.intersectObjects(this.pickObjects, true);

        if (this.controls.dragging) return;

        if (hits.length === 0) {
            this.controls.detach();
            this.events?.emit("entitySelected", { entityId: null });
            return;
        }

        const resolved = resolveHitEntity(hits[0].object as MeshWithEntity, this.world);
        if (resolved) {
            this.controls.attach(resolved.attachTarget);
            this.events?.emit("entitySelected", { entityId: resolved.entityId });
        } else {
            this.controls.detach();
            this.events?.emit("entitySelected", { entityId: null });
        }
    };

    setGizmoMode(mode: "translate" | "rotate"): void {
        if (this.controls.dragging) return;
        this.currentMode = mode;
        this.controls.setMode(mode);
        this.events?.emit("gizmoModeChanged", { mode });
    }

    dispose() {
        this.dragGhostController?.end();
        this.rendererDomElement.removeEventListener("mousedown", this.onMouseDown);
        window.removeEventListener("keydown", this.onKeyDown);
        this.controls.detach();
        this.scene.remove(this.controls.getHelper());
        this.controls.dispose();
    }

    update(world: World): void {
        this.world = world;

        // Guard: entity deleted mid-drag (e.g. undo) — clean up ghost.
        if (this.draggingEntity != null && !world.hasComponent(this.draggingEntity, Transform)) {
            this.dragGhostController?.end();
            this.draggingEntity = null;
            this.draggingEntityWasStatic = false;
            this.releaseFramesLeft = 0;
        }

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
