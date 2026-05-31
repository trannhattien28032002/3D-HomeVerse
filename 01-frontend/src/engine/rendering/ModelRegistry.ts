import * as THREE from "three";

/**
 * Tracks GLB root Objects3D by ECS entity id.
 *
 * Responsibilities:
 *   - Add / remove roots from the Three.js scene.
 *   - Does NOT dispose geometry — that is the responsibility of GLTFModelLoader's cache.
 *   - Cloned materials created during ghost preview are disposed by FurniturePlacementSystem.
 */
export class ModelRegistry {
    private roots = new Map<number, THREE.Object3D>();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    register(entityId: number, root: THREE.Object3D): void {
        this.roots.set(entityId, root);
    }

    get(entityId: number): THREE.Object3D | undefined {
        return this.roots.get(entityId);
    }

    /** Remove the root from the scene. Does NOT dispose shared geometry. */
    dispose(entityId: number): void {
        const root = this.roots.get(entityId);
        if (!root) return;
        this.scene.remove(root);
        this.roots.delete(entityId);
    }

    disposeAll(): void {
        for (const root of this.roots.values()) {
            this.scene.remove(root);
        }
        this.roots.clear();
    }
}
