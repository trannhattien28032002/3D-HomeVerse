import * as THREE from "three";

import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";

import { Transform } from "src/engine/components/core/Transform";
import { AmbientLightComponent } from "src/engine/components/lighting/AmbientLightComponent";
import { DirectionalLightComponent } from "src/engine/components/lighting/DirectionalLightComponent";
import { LightHandle } from "src/engine/components/lighting/LightHandle";

/**
 * LightSystem — đồng bộ component đèn (Ambient/Directional) sang đèn THREE.js thật.
 *
 * Lazy-create: lần đầu thấy entity có component đèn nhưng chưa có LightHandle thì
 * tạo THREE.Light, add vào scene, gắn LightHandle. Các frame sau chỉ cập nhật
 * màu/cường độ (và vị trí với đèn directional theo Transform). Cấu hình bóng đổ
 * (mapSize, vùng camera, bias) chỉ set một lần lúc tạo.
 */
export class LightSystem extends System {
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        super();
        this.scene = scene;
    }

    update(world: World, deltaTime: number): void {
        void deltaTime;

        const ambients = Query.entitiesWith(world, AmbientLightComponent);

        for (const e of ambients) {
            const data = world.getComponent(e, AmbientLightComponent);
            if (!data) continue;

            let handle = world.getComponent(e, LightHandle);

            if (!handle) {
                const light = new THREE.AmbientLight(
                    data.color,
                    data.intensity
                );

                this.scene.add(light);
                world.addComponent(e, new LightHandle(light));
                handle = world.getComponent(e, LightHandle);
            }

            if (handle) {
                handle.light.color.setHex(data.color);
                handle.light.intensity = data.intensity;
            }
        }

        const directionals = Query.entitiesWith(
            world,
            DirectionalLightComponent,
            Transform
        );

        for (const e of directionals) {
            const data = world.getComponent(e, DirectionalLightComponent);
            const transform = world.getComponent(e, Transform);
            if (!data || !transform) continue;

            let handle = world.getComponent(e, LightHandle);

            if (!handle) {
                const light = new THREE.DirectionalLight(
                    data.color,
                    data.intensity
                );

                light.castShadow = data.castShadow;

                light.shadow.mapSize.width = data.shadowMapSize;
                light.shadow.mapSize.height = data.shadowMapSize;

                const s = data.shadowCameraSize;
                light.shadow.camera.left = -s;
                light.shadow.camera.right = s;
                light.shadow.camera.top = s;
                light.shadow.camera.bottom = -s;

                light.shadow.bias = data.shadowBias;

                this.scene.add(light);
                world.addComponent(e, new LightHandle(light));

                handle = world.getComponent(e, LightHandle);
            }

            if (handle) {
                handle.light.color.setHex(data.color);
                handle.light.intensity = data.intensity;

                handle.light.position.set(
                    transform.x,
                    transform.y,
                    transform.z
                );
            }
        }
    }
}
