import { Component } from "../ecs/Component";

export class ColliderAABB extends Component {
    width: number;
    height: number;
    depth: number;

    constructor(width = 1, height = 1, depth = 1) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;
    }
}