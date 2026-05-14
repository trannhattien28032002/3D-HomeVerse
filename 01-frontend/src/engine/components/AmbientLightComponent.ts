import { Component } from "src/engine/ecs/Component";

export class AmbientLightComponent extends Component {
    color: number;
    intensity: number;

    constructor(color: number = 0xffffff, intensity: number = 0.4) {
        super();

        this.color = color;
        this.intensity = intensity;
    }
}