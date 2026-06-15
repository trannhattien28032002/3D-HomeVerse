import * as THREE from "three";

/**
 * MeshRegistry — registry trung tâm quản lý vòng đời mesh Three.js.
 *
 * System đăng ký mesh tại đây khi tạo; mọi việc huỷ đều đi qua registry này
 * (gỡ khỏi scene + dispose geometry). KHÔNG dispose vật liệu — vật liệu thuộc
 * quyền MaterialRegistry (dùng chung nên không huỷ ở đây).
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

    /** Gỡ mesh khỏi scene và dispose geometry. No-op nếu key không tồn tại. */
    dispose(key: string): void {
        const mesh = this.meshes.get(key);
        if (!mesh) return;
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
    }

    /** Dispose mọi mesh đã đăng ký. Gọi một lần khi engine tắt. */
    disposeAll(): void {
        for (const mesh of this.meshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes.clear();
    }
}
