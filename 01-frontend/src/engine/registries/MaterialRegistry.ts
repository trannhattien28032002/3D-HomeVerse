import * as THREE from "three";

export type MaterialSignature = {
    color: number;
    metalness: number;
    roughness: number;
    side?: THREE.Side;
};

/**
 * MaterialRegistry — pool vật liệu dùng chung, đánh khoá theo "chữ ký" (signature).
 *
 * Vật liệu có cùng tham số (màu/metalness/roughness/side) trả về cùng một instance
 * → không cấp phát trùng MeshStandardMaterial, tiết kiệm bộ nhớ GPU.
 * releaseAll() dispose mọi vật liệu cache; chỉ gọi khi engine tắt.
 */
export class MaterialRegistry {
    private materials = new Map<string, THREE.MeshStandardMaterial>();

    private toKey(sig: MaterialSignature): string {
        return `${sig.color}|${sig.metalness}|${sig.roughness}|${sig.side ?? THREE.FrontSide}`;
    }

    get(sig: MaterialSignature): THREE.MeshStandardMaterial {
        const key = this.toKey(sig);
        let mat = this.materials.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({
                color: sig.color,
                metalness: sig.metalness,
                roughness: sig.roughness,
                ...(sig.side !== undefined ? { side: sig.side } : {}),
            });
            this.materials.set(key, mat);
        }
        return mat;
    }

    releaseAll(): void {
        for (const mat of this.materials.values()) mat.dispose();
        this.materials.clear();
    }
}
