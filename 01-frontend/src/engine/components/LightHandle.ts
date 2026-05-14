import * as THREE from "three";
import { Component } from "src/engine/ecs/Component.js";

export class LightHandle extends Component {
    light: THREE.Light;

    constructor(light: THREE.Light) {
        super();
        this.light = light;
    }
}
