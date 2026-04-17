import { Component } from "../ecs/Component";

export type SnapAxes = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz";

type SnapToGridOptions = {
    enabled?: boolean;
    size?: number;
    axes?: SnapAxes;
    offsetX?: number;
    offsetY?: number;
    offsetZ?: number;
};

export class SnapToGrid extends Component {
    enabled: boolean;
    size: number;
    axes: SnapAxes;
    offsetX: number;
    offsetY: number;
    offsetZ: number;

    constructor({
        enabled = true,
        size = 0.5,
        axes = "xz",
        offsetX = 0,
        offsetY = 0,
        offsetZ = 0
    }: SnapToGridOptions = {}) {
        super();
        this.enabled = enabled;
        this.size = size;
        this.axes = axes;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.offsetZ = offsetZ;
    }
}

