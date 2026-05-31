import { Component } from "src/engine/ecs/Component.js";

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

        // Shadow settings
        this.castShadow = true;
        this.shadowMapSize = 2048;
        // Size 8 → shadow orthographic camera covers only 16×16m; a standard house is 10–15m wide.
        // Size 25 → covers 50×50m, enough for any residential floor plan.
        this.shadowCameraSize = 25;
        this.shadowBias = -0.0002;
    }
}