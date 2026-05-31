import * as THREE from "three";

import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/Transform";
import { ColliderAABB } from "src/engine/components/ColliderAABB";

/**
 * Debug-only system that visualises ColliderAABB hulls as yellow wireframe boxes.
 * Toggle on/off with the 'B' key. Only register this system in development builds.
 *
 * Displays boxes from half-extents stored in ColliderAABB, centered at Transform (x,y,z).
 */
export class CollisionDebugSystem extends System {
    private readonly scene: THREE.Scene;
    private enabled = false;
    private readonly helpers = new Map<number, THREE.LineSegments>();

    private readonly onKeyDown: (e: KeyboardEvent) => void;

    constructor(scene: THREE.Scene) {
        super();
        this.scene = scene;
        this.onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "p" || e.key === "P") this.toggle();
        };
        document.addEventListener("keydown", this.onKeyDown);
    }

    private toggle(): void {
        this.enabled = !this.enabled;
        for (const box of this.helpers.values()) {
            box.visible = this.enabled;
        }
    }

    override update(world: World): void {
        const entities = Query.entitiesWith(world, Transform, ColliderAABB);
        const seen = new Set<number>();

        for (const entity of entities) {
            seen.add(entity);
            const t = world.getComponent(entity, Transform)!;
            const c = world.getComponent(entity, ColliderAABB)!;

            let box = this.helpers.get(entity);
            if (!box) {
                const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
                const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
                box = new THREE.LineSegments(geom, mat);
                box.visible = this.enabled;
                this.scene.add(box);
                this.helpers.set(entity, box);
            }

            // ColliderAABB stores half-extents (local frame) + full quaternion = OBB.
            box.position.set(t.x, t.y, t.z);
            box.quaternion.set(t.qx, t.qy, t.qz, t.qw);
            box.scale.set(c.width * 2, c.height * 2, c.depth * 2);
        }

        // Remove helpers for entities that no longer exist.
        for (const [entity, box] of this.helpers) {
            if (!seen.has(entity)) {
                this.scene.remove(box);
                (box.geometry as THREE.EdgesGeometry).dispose();
                (box.material as THREE.LineBasicMaterial).dispose();
                this.helpers.delete(entity);
            }
        }
    }

    dispose(): void {
        document.removeEventListener("keydown", this.onKeyDown);
        for (const box of this.helpers.values()) {
            this.scene.remove(box);
            (box.geometry as THREE.EdgesGeometry).dispose();
            (box.material as THREE.LineBasicMaterial).dispose();
        }
        this.helpers.clear();
    }
}
