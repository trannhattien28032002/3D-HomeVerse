import { Component } from "src/engine/ecs/Component";

export class FurnitureTag extends Component {
    readonly modelId: string;

    constructor(modelId: string) {
        super();
        this.modelId = modelId;
    }
}
