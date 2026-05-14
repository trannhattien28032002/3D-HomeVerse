import * as THREE from "three";

export type MaterialSignature = {
    color: number;
    metalness: number;
    roughness: number;
    side?: THREE.Side;
};

/**
 * Shared material pool keyed by signature. Materials with identical parameters
 * return the same instance — no duplicate MeshStandardMaterial allocations.
 * releaseAll() disposes every cached material; call only on engine shutdown.
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
