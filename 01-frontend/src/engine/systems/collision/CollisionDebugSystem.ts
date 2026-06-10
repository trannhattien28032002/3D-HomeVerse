import * as THREE from "three";

import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";

/**
 * CollisionDebugSystem — system CHỈ-DEBUG, vẽ hộp va chạm ColliderAABB dưới dạng
 * khung dây màu vàng để kiểm tra trực quan.
 *
 * Bật/tắt bằng phím 'P'. Chỉ đăng ký system này ở bản dev (xem systemSetup).
 * Hộp dựng từ half-extent trong ColliderAABB + quaternion của Transform = OBB.
 */
export class CollisionDebugSystem extends System {
    private readonly scene: THREE.Scene;
    private enabled = false;
    private readonly helpers = new Map<string, THREE.LineSegments>();

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
        const seen = new Set<string>();

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

            // ColliderAABB lưu half-extent (hệ cục bộ) + quaternion đầy đủ = OBB.
            box.position.set(t.x, t.y, t.z);
            box.quaternion.set(t.qx, t.qy, t.qz, t.qw);
            box.scale.set(c.width * 2, c.height * 2, c.depth * 2);
        }

        // Gỡ helper của các entity không còn tồn tại.
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
