import { System } from "../ecs/System";
import { Query } from "../ecs/Query";
import { Transform } from "../components/Transform";
import { Grounded } from "../components/Grounded";
import { World } from "../ecs/World";

export class GroundSystem extends System {
    update(world: World, deltaTime: number) {
        void deltaTime;
        const entities = Query.entitiesWith(world, Transform, Grounded);

        for (const entity of entities) {
            const transform = world.getComponent(entity, Transform);
            const grounded = world.getComponent(entity, Grounded);
            if (!transform || !grounded) continue;

            // Fake floor at y = 0;
            if (transform.y <= 0) {
                transform.y = 0;
                grounded.isGrounded = true;
            }
        }
    }
}
