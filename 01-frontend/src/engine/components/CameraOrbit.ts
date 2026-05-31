import { Component } from "src/engine/ecs/Component";

export class CameraOrbit extends Component {
    radius: number;
    azimuth: number;   // ngang (left-right)
    polar: number;     // dọc (up-down)

    sensitivity: number;
    targetHeight: number;

    constructor({
        radius = 5,
        azimuth = 0,
        polar = Math.PI / 4,
        sensitivity = 0.005,
        targetHeight = 1
    } = {}) {
        super();

        this.radius = radius;
        this.azimuth = azimuth;
        this.polar = polar;
        this.sensitivity = sensitivity;
        this.targetHeight = targetHeight;
    }
}