import * as THREE from "three";

/**
 * ModelRegistry — theo dõi Object3D gốc của GLB theo ECS entity id.
 *
 * Trách nhiệm:
 *   - Thêm / gỡ root khỏi scene Three.js.
 *   - KHÔNG dispose geometry — đó là việc của cache trong GLTFModelLoader (dùng chung).
 *   - Vật liệu clone tạo ra lúc ghost-preview do FurniturePlacementSystem dispose.
 */
export class ModelRegistry {
    private roots = new Map<string, THREE.Object3D>();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    register(entityId: string, root: THREE.Object3D): void {
        this.roots.set(entityId, root);
    }

    get(entityId: string): THREE.Object3D | undefined {
        return this.roots.get(entityId);
    }

    /** Gỡ root khỏi scene. KHÔNG dispose geometry dùng chung. */
    dispose(entityId: string): void {
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
