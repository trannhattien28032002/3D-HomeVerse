import * as THREE from "three";
import { World } from "src/engine/ecs/World";
import { Model3D } from "src/engine/components/Model3D";
import { Mesh } from "src/engine/components/Mesh";

interface IntendedPose {
    x: number;
    y: number;
    z: number;
    qx?: number;
    qy?: number;
    qz?: number;
    qw?: number;
}

/**
 * Manages a ghost preview during Gizmo drag operations.
 *
 * Lifecycle per drag session:
 *   begin(world, entityId)  → clone entity's visual into a transparent ghost, add to scene
 *   update(pose, colliding) → reposition ghost each objectChange; red tint when colliding
 *   hide()                  → make invisible without disposing (cursor back in free space)
 *   end()                   → dispose ghost when drag ends
 *
 * Tint palette (matches FurniturePlacementSystem):
 *   colliding  — color 0xff1a1a, emissive 0x880000, opacity 0.6
 *   free       — restored to original material values
 */
export class DragGhostController {
    private readonly scene: THREE.Scene;
    private ghostRoot: THREE.Object3D | null = null;
    private ghostMaterials: THREE.MeshStandardMaterial[] = [];
    private originalColors: THREE.Color[] = [];
    private originalEmissives: THREE.Color[] = [];
    private originalOpacities: number[] = [];
    private lastColliding: boolean | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Clone the entity's visual root, apply ghost material, add to scene.
     * Calls end() first to safely replace any leftover ghost from a prior session.
     */
    begin(world: World, entityId: number): void {
        this.end();

        const modelComp = world.getComponent(entityId, Model3D);
        const meshComp = world.getComponent(entityId, Mesh);
        const sourceRoot = modelComp?.root ?? meshComp?.mesh ?? null;
        if (!sourceRoot) return;

        const ghost = sourceRoot.clone(true);

        // Replace every mesh's material with a transparent clone.
        ghost.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
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
                const c = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
                c.transparent = true;
                c.opacity = 0.45;
                c.depthWrite = false;
                mesh.material = c;
            }
        });

        // Cache tint properties for state toggling (emissive check guards MeshBasicMaterial).
        ghost.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
                const std = m as THREE.MeshStandardMaterial;
                if (std.emissive instanceof THREE.Color) {
                    this.ghostMaterials.push(std);
                    this.originalColors.push(std.color.clone());
                    this.originalEmissives.push(std.emissive.clone());
                    this.originalOpacities.push(std.opacity);
                }
            }
        });

        ghost.visible = false;
        this.scene.add(ghost);
        this.ghostRoot = ghost;
        this.lastColliding = null;
    }

    /**
     * Reposition ghost to intended pose and update tint.
     * Tint traverse only runs on state flip (colliding ↔ free) — not every call.
     */
    update(intended: IntendedPose, isColliding: boolean): void {
        const ghost = this.ghostRoot;
        if (!ghost) return;

        ghost.position.set(intended.x, intended.y, intended.z);
        if (intended.qx !== undefined) ghost.quaternion.set(intended.qx, intended.qy!, intended.qz!, intended.qw!);
        ghost.visible = true;

        if (isColliding !== this.lastColliding) {
            this.lastColliding = isColliding;
            this.applyTint(isColliding);
        }
    }

    /** Hide ghost without disposing — used when cursor moves to a free spot. */
    hide(): void {
        if (this.ghostRoot) this.ghostRoot.visible = false;
        this.lastColliding = null;
    }

    /** Remove ghost from scene and dispose cloned materials. Call when drag ends. */
    end(): void {
        if (this.ghostRoot) {
            this.scene.remove(this.ghostRoot);
            this.ghostRoot.traverse((child) => {
                if (!(child as THREE.Mesh).isMesh) return;
                const mesh = child as THREE.Mesh;
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((m) => m.dispose());
                } else {
                    (mesh.material as THREE.Material).dispose();
                }
            });
            this.ghostRoot = null;
        }
        this.ghostMaterials = [];
        this.originalColors = [];
        this.originalEmissives = [];
        this.originalOpacities = [];
        this.lastColliding = null;
    }

    dispose(): void {
        this.end();
    }

    private applyTint(colliding: boolean): void {
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
}
