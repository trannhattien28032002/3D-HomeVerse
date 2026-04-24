import { System } from "../ecs/System.js";
import { Query } from "../ecs/Query.js";
import { Transform } from "../components/Transform.js";
import { Grounded } from "../components/Grounded.js";
import { World } from "../ecs/World.js";

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
