import { Component } from "src/engine/ecs/Component";

type WallSizeOptions = {
    length?: number;
    height?: number;
    thickness?: number; // accepted for call-site compat but NOT stored — use WallNodes.thickness
};

export class WallSize extends Component {
    length: number;
    height: number;

    constructor({
        length = 5,
        height = 3,
    }: WallSizeOptions = {}) {
        super();
        this.length = length;
        this.height = height;
    }
}