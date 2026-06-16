/**
 * GroundSystem — giữ các entity Grounded không lọt xuống dưới mặt sàn (y = 0).
 *
 * Mỗi frame: nếu y ≤ 0 thì kẹp về 0 và đánh dấu isGrounded. Đây là "sàn giả"
 * đơn giản, không qua physics — đủ cho mô hình tĩnh của app thiết kế nội thất.
 */
import { System } from "src/engine/ecs/System";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { Grounded } from "src/engine/components/physics/Grounded";
import { World } from "src/engine/ecs/World";

export class GroundSystem extends System {
    update(world: World, deltaTime: number) {
        void deltaTime;
        const entities = Query.entitiesWith(world, Transform, Grounded);

        for (const entity of entities) {
            const transform = world.getComponent(entity, Transform);
            const grounded = world.getComponent(entity, Grounded);
            if (!transform || !grounded) continue;

            // Sàn giả tại y = 0;
            if (transform.y <= 0) {
                transform.y = 0;
                grounded.isGrounded = true;
            }
        }
    }
}
