import { Component } from "src/engine/ecs/Component";

type WallSizeOptions = {
    length?: number;
    height?: number;
    thickness?: number;
};

export class WallSize extends Component {
    length: number;
    height: number;
    thickness: number;

    constructor({
        length = 5,
        height = 3,
        thickness = 0.2
    }: WallSizeOptions = {}) {
        super();

        this.length = length;
        this.height = height;
        this.thickness = thickness;
    }
}