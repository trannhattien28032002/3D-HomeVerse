import { Transform } from "src/engine/components/Transform.js";
import { AmbientLightComponent } from "src/engine/components/AmbientLightComponent.js";
import { DirectionalLightComponent } from "src/engine/components/DirectionalLightComponent.js";
import type { World } from "src/engine/ecs/World.js";

export function createAmbientLight(world: World,
    {color = 0xffffff, intensity = 0.35} = {}) {
        const e = world.createEntity();
        world.addComponent(e, new AmbientLightComponent(color, intensity));
        return e
    }

export function createDirectionalLight(world: World,
    { x = 5, y = 10, z = 5, color = 0xffffff, intensity = 0.9 } = {}) {
        const e = world.createEntity();
        world.addComponent(e, new Transform(x, y, z));
        world.addComponent(e, new DirectionalLightComponent(color, intensity));
        return e;
    }