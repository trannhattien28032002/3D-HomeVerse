import { Component } from "../ecs/Component";

export class WallTag extends Component {
    wallId: number;

    constructor(wallId: number) {
        super();
        this.wallId = wallId;
    }
}
