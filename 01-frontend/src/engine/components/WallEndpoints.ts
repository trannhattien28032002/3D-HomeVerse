import { Component } from "src/engine/ecs/Component";

type Vec2 = {
    x: number;
    z: number;
};

type WallEndpointsOptions = {
    start?: Vec2;
    end?: Vec2;
};

export class WallEndpoints extends Component {
    start: Vec2;
    end: Vec2;

    constructor({
        start = { x: 0, z: 0 },
        end = { x: 1, z: 0 }
    }: WallEndpointsOptions = {}) {
        super();

        this.start = start;
        this.end = end;
    }
}