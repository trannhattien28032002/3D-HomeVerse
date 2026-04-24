import * as THREE from "three";

import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { Query } from "../ecs/Query";

import { Transform } from "../components/Transform";
import { AmbientLightComponent } from "../components/AmbientLightComponent";
import { DirectionalLightComponent } from "../components/DirectionalLightComponent";
import { LightHandle } from "../components/LightHandle";

export class LightSystem extends System {
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        super();
        this.scene = scene;
    }

    update(world: World, deltaTime: number): void {
        void deltaTime;

        // =====================
        // 🌤 AMBIENT LIGHTS
        // =====================
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

        // =====================
        // ☀️ DIRECTIONAL LIGHTS
        // =====================
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
