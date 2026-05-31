import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { getAssetPath, getBoundingBox } from "src/engine/game/FurnitureCatalog";
import { resolveCollisionFootprint } from "src/engine/game/getFootprint";
import type { ModelTemplate } from "src/engine/rendering/GLTFModelLoader";
import { CannonCollisionSystem } from "src/engine/systems/CannonCollisionSystem";
import { snapToGridM } from "src/shared/constants/placement";

/**
 * Manages the ghost-preview placement flow:
 *   begin(modelId) → async GLB load → ghost appears, follows mouse on the floor plane
 *   left-click     → confirm: dispatch PLACE_FURNITURE + cleanup
 *   right-click    → cancel: remove ghost + cleanup
 *
 * Not an ECS System (no update() loop) — managed directly by engine.ts.
 * Registers its own DOM listeners on the renderer canvas during active placement only.
 *
 * Ghost geometry is a clone of the GLB template — shared geometry is never disposed here.
 * Only the cloned materials created for the ghost are disposed on cleanup.
 */
export class FurniturePlacementSystem {
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.Camera;
    private readonly domElement: HTMLElement;
    private readonly orbitControls: OrbitControls;
    private readonly dispatch: (cmd: EngineCommand) => void;
    private readonly events: EngineEvents;
    private readonly loader: GLTFModelLoader;
    private readonly collisionSystem: CannonCollisionSystem;

    private active = false;
    private modelId: string | null = null;
    private template: ModelTemplate | null = null;
    private ghostRoot: THREE.Group | null = null;
    private isColliding = false;
    private ghostMaterials: THREE.MeshStandardMaterial[] = [];
    private originalEmissives: THREE.Color[] = [];
    private originalColors: THREE.Color[] = [];
    private originalOpacities: number[] = [];

    private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private readonly raycaster = new THREE.Raycaster();
    private readonly ndc = new THREE.Vector2();
    private readonly hitPoint = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        camera: THREE.Camera,
        domElement: HTMLElement,
        orbitControls: OrbitControls,
        dispatch: (cmd: EngineCommand) => void,
        events: EngineEvents,
        loader: GLTFModelLoader,
        collisionSystem: CannonCollisionSystem,
    ) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.orbitControls = orbitControls;
        this.dispatch = dispatch;
        this.events = events;
        this.loader = loader;
        this.collisionSystem = collisionSystem;
    }

    /** Enter placement mode for the given model. Cancels any active placement first. */
    begin(modelId: string): void {
        if (this.active) this.cleanup();

        this.active = true;
        this.modelId = modelId;

        // Disable orbit so camera doesn't rotate on clicks/drags during placement.
        this.orbitControls.enabled = false;

        // Capture phase so we intercept before GizmoSystem's bubble-phase listener.
        this.domElement.addEventListener("mousemove", this.onMouseMove);
        this.domElement.addEventListener("mousedown", this.onMouseDown, { capture: true });
        this.domElement.addEventListener("contextmenu", this.onContextMenu, { capture: true });

        this.events.emit("placementStarted", { modelId });
        this.events.emit("placementLoading", { modelId });

        let assetPath: string;
        try {
            assetPath = getAssetPath(modelId);
        } catch (err) {
            this.events.emit("placementError", { modelId, error: String(err) });
            this.cleanup();
            return;
        }

        this.loader.load(assetPath, getBoundingBox(modelId)).then((template) => {
            // Guard: placement may have been cancelled while the GLB was loading.
            if (!this.active || this.modelId !== modelId) return;
            this.template = template;

            const ghost = template.scene.clone(true) as THREE.Group;

            // Apply semi-transparent ghost material to every mesh in the cloned group.
            ghost.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (Array.isArray(mesh.material)) {
                        mesh.material = mesh.material.map((m) => {
                            const c = m.clone();
                            c.transparent = true;
                            c.opacity = 0.45;
                            c.depthWrite = false;
                            return c;
                        });
                    } else {
                        const cloned = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
                        cloned.transparent = true;
                        cloned.opacity = 0.45;
                        cloned.depthWrite = false;
                        mesh.material = cloned;
                    }
                }
            });

            // Cache materials and original tint properties for collision state toggling.
            this.ghostMaterials = [];
            this.originalEmissives = [];
            this.originalColors = [];
            this.originalOpacities = [];
            ghost.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    for (const m of mats) {
                        const std = m as THREE.MeshStandardMaterial;
                        if (std.emissive instanceof THREE.Color) {
                            this.ghostMaterials.push(std);
                            this.originalEmissives.push(std.emissive.clone());
                            this.originalColors.push(std.color.clone());
                            this.originalOpacities.push(std.opacity);
                        }
                    }
                }
            });

            ghost.visible = false;
            this.scene.add(ghost);
            this.ghostRoot = ghost;
            this.events.emit("placementReady", { modelId });
        }).catch((err) => {
            this.events.emit("placementError", { modelId, error: String(err) });
            this.cleanup();
        });
    }

    /** Cancel placement and remove the ghost. */
    cancel(): void {
        if (!this.active) return;
        this.cleanup();
        this.events.emit("placementCancelled", {});
    }

    private confirm(x: number, z: number): void {
        const modelId = this.modelId!;
        this.cleanup();
        this.dispatch({ type: "PLACE_FURNITURE", modelId, x, z, rotY: 0 });
        this.events.emit("placementConfirmed", { modelId, x, z });
    }

    private cleanup(): void {
        if (this.ghostRoot) {
            this.scene.remove(this.ghostRoot);
            // Only dispose the cloned materials — do NOT dispose shared geometry
            // (geometry lives in GLTFModelLoader's cache and is reused across clones).
            this.ghostRoot.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach((m) => m.dispose());
                    } else {
                        (mesh.material as THREE.Material).dispose();
                    }
                }
            });
            this.ghostRoot = null;
        }
        this.domElement.removeEventListener("mousemove", this.onMouseMove);
        this.domElement.removeEventListener("mousedown", this.onMouseDown, { capture: true });
        this.domElement.removeEventListener("contextmenu", this.onContextMenu, { capture: true });
        this.orbitControls.enabled = true;
        this.template = null;
        this.isColliding = false;
        this.ghostMaterials = [];
        this.originalEmissives = [];
        this.originalColors = [];
        this.originalOpacities = [];
        this.active = false;
        this.modelId = null;
    }

    private applyGhostTint(colliding: boolean): void {
        for (let i = 0; i < this.ghostMaterials.length; i++) {
            const mat = this.ghostMaterials[i];
            if (colliding) {
                mat.color.setHex(0xff1a1a);
                mat.emissive.setHex(0x880000);
                mat.opacity = 0.6;
            } else {
                mat.color.copy(this.originalColors[i]);
                mat.emissive.copy(this.originalEmissives[i]);
                mat.opacity = this.originalOpacities[i];
            }
        }
    }

    private onMouseMove = (e: MouseEvent): void => {
        const ghost = this.ghostRoot;
        if (!ghost) return;
        const rect = this.domElement.getBoundingClientRect();
        this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.ndc, this.camera);
        if (this.raycaster.ray.intersectPlane(this.floorPlane, this.hitPoint)) {
            ghost.position.x = snapToGridM(this.hitPoint.x);
            ghost.position.z = snapToGridM(this.hitPoint.z);
            ghost.visible = true;

            if (this.template && this.modelId) {
                // Use the shared priority-chain helper so ghost footprint always matches the
                // spawned entity (tier 1: _col mesh, tier 2: JSON, tier 3: visual AABB).
                const fp = resolveCollisionFootprint(this.modelId, this.template);
                const collisionW = fp.width;
                const collisionD = fp.depth;
                const collisionH = fp.height;
                const testY = collisionH / 2;
                const colliding = this.collisionSystem.wouldCollideCustom(
                    ghost.position.x, testY, ghost.position.z,
                    collisionW, collisionD, collisionH, 0, 0, 0, 1,
                );
                if (colliding !== this.isColliding) {
                    this.isColliding = colliding;
                    this.applyGhostTint(colliding);
                }
            }
        }
    };

    private onMouseDown = (e: MouseEvent): void => {
        if (!this.active) return;
        e.stopPropagation();
        if (e.button === 0) {
            if (this.isColliding) return;
            const x = this.ghostRoot?.position.x ?? 0;
            const z = this.ghostRoot?.position.z ?? 0;
            this.confirm(x, z);
        } else if (e.button === 2) {
            this.cancel();
        }
    };

    private onContextMenu = (e: MouseEvent): void => {
        if (!this.active) return;
        e.preventDefault();
        e.stopPropagation();
    };

    dispose(): void {
        this.cleanup();
    }
}
