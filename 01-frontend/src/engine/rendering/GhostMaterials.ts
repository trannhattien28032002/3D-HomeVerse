import * as THREE from "three";

const GHOST_OPACITY = 0.45;
const COLLIDE_COLOR = 0xff1a1a;
const COLLIDE_EMISSIVE = 0x880000;
const COLLIDE_OPACITY = 0.6;

export class GhostMaterialSet {
    private readonly materials: THREE.MeshStandardMaterial[] = [];
    private readonly originalColors: THREE.Color[] = [];
    private readonly originalEmissives: THREE.Color[] = [];
    private readonly originalOpacities: number[] = [];

    static apply(root: THREE.Object3D): GhostMaterialSet {
        const set = new GhostMaterialSet();
        root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const ghosted = source.map((m) => {
                const clone = m.clone();
                clone.transparent = true;
                clone.opacity = GHOST_OPACITY;
                clone.depthWrite = false;
                const std = clone as THREE.MeshStandardMaterial;
                if (std.emissive instanceof THREE.Color) {
                    set.materials.push(std);
                    set.originalColors.push(std.color.clone());
                    set.originalEmissives.push(std.emissive.clone());
                    set.originalOpacities.push(std.opacity);
                }
                return clone;
            });
            mesh.material = Array.isArray(mesh.material) ? ghosted : ghosted[0];
        });
        return set;
    }

    setColliding(colliding: boolean): void {
        for (let i = 0; i < this.materials.length; i++) {
            const mat = this.materials[i];
            if (colliding) {
                mat.color.setHex(COLLIDE_COLOR);
                mat.emissive.setHex(COLLIDE_EMISSIVE);
                mat.opacity = COLLIDE_OPACITY;
            } else {
                mat.color.copy(this.originalColors[i]);
                mat.emissive.copy(this.originalEmissives[i]);
                mat.opacity = this.originalOpacities[i];
            }
        }
    }

    static disposeClonedMaterials(root: THREE.Object3D): void {
        root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => m.dispose());
            } else {
                (mesh.material as THREE.Material).dispose();
            }
        });
    }
}
