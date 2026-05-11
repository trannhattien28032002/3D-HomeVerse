import { Component } from "../ecs/Component";

export class RoomGeometry extends Component {
    points: { x: number; z: number }[];
    area: number;

    constructor(points: { x: number; z: number }[], area: number) {
        super();
        this.points = points;
        this.area = area;
    }
}
