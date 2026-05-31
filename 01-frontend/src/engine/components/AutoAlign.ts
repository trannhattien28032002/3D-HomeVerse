import { Component } from "src/engine/ecs/Component";

export type AutoAlignAxes = "x" | "z" | "xz";

type AutoAlignOptions = {
    enabled?: boolean;
    axes?: AutoAlignAxes;
    tolerance?: number;
};

export class AutoAlign extends Component {
    enabled: boolean;
    axes: AutoAlignAxes;
    tolerance: number;

    constructor({ enabled = true, axes = "xz", tolerance = 0.15 }: AutoAlignOptions = {}) {
        super();
        this.enabled = enabled;
        this.axes = axes;
        this.tolerance = tolerance;
    }
}

