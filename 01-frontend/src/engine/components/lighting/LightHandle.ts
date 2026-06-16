import * as THREE from "three";
import { Component } from "src/engine/ecs/Component.js";

/**
 * LightHandle — giữ tham chiếu tới đối tượng THREE.Light thật đã add vào scene.
 *
 * Cầu nối giữa dữ liệu ECS (AmbientLight/DirectionalLightComponent) và đèn Three.js:
 * LightSystem tạo đèn, lưu vào đây để các frame sau cập nhật/huỷ mà không tạo lại.
 */
export class LightHandle extends Component {
    light: THREE.Light;

    constructor(light: THREE.Light) {
        super();
        this.light = light;
    }
}
