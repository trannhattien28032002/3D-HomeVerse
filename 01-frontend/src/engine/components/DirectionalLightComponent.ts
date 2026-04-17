import { Component } from "../ecs/Component.js";

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
        this.shadowCameraSize = 8;
        this.shadowBias = -0.0002;
    }
}