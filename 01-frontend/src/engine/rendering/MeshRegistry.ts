import * as THREE from "three";

/**
 * Central registry that owns Three.js mesh lifecycle.
 * Systems register meshes here on creation; disposal goes through this registry.
 * Does NOT dispose materials — those are owned by MaterialRegistry.
 */
export class MeshRegistry {
    private meshes = new Map<string, THREE.Mesh>();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    register(key: string, mesh: THREE.Mesh): void {
        this.meshes.set(key, mesh);
    }

    get(key: string): THREE.Mesh | undefined {
        return this.meshes.get(key);
    }

    has(key: string): boolean {
        return this.meshes.has(key);
    }

    /** Remove mesh from scene and dispose its geometry. No-op if key is unknown. */
    dispose(key: string): void {
        const mesh = this.meshes.get(key);
        if (!mesh) return;
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
    }

    /** Dispose every registered mesh. Called once on engine shutdown. */
    disposeAll(): void {
        for (const mesh of this.meshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes.clear();
    }
}
