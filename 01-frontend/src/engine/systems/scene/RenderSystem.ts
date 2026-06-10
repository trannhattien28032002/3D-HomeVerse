import * as THREE from "three";

import { System } from "src/engine/ecs/System";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { WorldSpaceMesh } from "src/engine/components/render/WorldSpaceMesh";
import { World } from "src/engine/ecs/World";

/**
 * RenderSystem — đồng bộ Transform của ECS xuống mesh Three.js rồi render scene.
 *
 * Hai đường đặt vị trí:
 *   - WorldSpaceMesh: toạ độ đã nằm trong geometry → chỉ set y, reset xoay (dùng cho tường).
 *   - Mặc định      : áp đầy đủ position + quaternion từ Transform (dùng cho đồ thường).
 * Là system chạy gần CUỐI mỗi frame (gọi renderer.render). Lưu ý hiệu năng: hiện
 * đồng bộ MỌI mesh mỗi frame kể cả vật tĩnh — điểm có thể tối ưu bằng dirty-flag.
 */
export class RenderSystem extends System {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.Camera;

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
    ) {
        super();
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
    }

    update(world: World, deltaTime: number): void {
        void deltaTime;
        const entities = Query.entitiesWith(world, Transform, Mesh);

        for (const entity of entities) {
            const transform = world.getComponent(entity, Transform)!;
            const meshComp = world.getComponent(entity, Mesh)!;
            const mesh = meshComp.mesh;
            const isWorldSpace = world.hasComponent(entity, WorldSpaceMesh);

            if (isWorldSpace) {
                mesh.position.set(0, transform.y, 0);
                mesh.rotation.set(0, 0, 0);
            } else {
                mesh.position.set(transform.x, transform.y, transform.z);
                mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}
