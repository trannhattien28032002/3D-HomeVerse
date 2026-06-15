import { Component } from "src/engine/ecs/Component.js";

/**
 * DirectionalLightComponent — nguồn sáng định hướng (như mặt trời), tạo bóng đổ.
 *
 * Ngoài color/intensity còn cấu hình chất lượng bóng: `shadowMapSize` (độ phân giải),
 * `shadowCameraSize` (vùng phủ của camera bóng), `shadowBias` (chống sọc shadow acne).
 */
export class DirectionalLightComponent extends Component {
    color: number;
    intensity: number;
    castShadow: boolean;
    shadowMapSize: number;
    shadowCameraSize: number;
    shadowBias: number;
    
    constructor(color = 0xffffff, intensity = 0.8) {
        super();
        this.color = color;
        this.intensity = intensity;

        // Cấu hình bóng đổ
        this.castShadow = true;
        this.shadowMapSize = 2048;
        // Size 8 → camera bóng orthographic chỉ phủ 16×16m; nhà tiêu chuẩn rộng 10–15m.
        // Size 25 → phủ 50×50m, đủ cho mọi mặt bằng nhà ở.
        this.shadowCameraSize = 25;
        this.shadowBias = -0.0002;
    }
}