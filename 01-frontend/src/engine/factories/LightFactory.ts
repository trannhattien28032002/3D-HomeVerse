/**
 * LightFactory — helper tạo entity đèn cho scene.
 *
 * createAmbientLight: đèn môi trường (không vị trí, chiếu đều).
 * createDirectionalLight: đèn định hướng kiểu mặt trời — cần Transform để biết
 * vị trí/hướng và tạo bóng đổ. LightSystem sẽ biến các component này thành
 * đối tượng THREE.Light thật.
 */
import { Transform } from "src/engine/components/core/Transform.js";
import { AmbientLightComponent } from "src/engine/components/lighting/AmbientLightComponent.js";
import { DirectionalLightComponent } from "src/engine/components/lighting/DirectionalLightComponent.js";
import type { World } from "src/engine/ecs/World.js";

export function createAmbientLight(world: World,
    { color = 0xffffff, intensity = 0.35 } = {}) {
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