import { Component } from "../ecs/Component";

export class Transform extends Component {
    x: number;
    y: number;
    z: number;
    rotY: number;

    constructor(x = 0, y = 0, z = 0, rotY = 0) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
        this.rotY = rotY;
    }
}