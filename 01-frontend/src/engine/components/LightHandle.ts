import { Component } from "../ecs/Component.js";

export class LightHandle extends Component {
    light: any;

    constructor(light: any) {
        super();
        this.light = light;
    }
}