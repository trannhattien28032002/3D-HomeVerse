import { Component } from "src/engine/ecs/Component";

/**
 * AmbientLightComponent — mô tả ánh sáng môi trường (chiếu đều mọi hướng, không bóng).
 * LightSystem đọc color/intensity để tạo/đồng bộ THREE.AmbientLight nâng nền sáng tổng thể.
 */
export class AmbientLightComponent extends Component {
    color: number;
    intensity: number;

    constructor(color: number = 0xffffff, intensity: number = 0.4) {
        super();

        this.color = color;
        this.intensity = intensity;
    }
}