import { Component } from "src/engine/ecs/Component";

type DraggableOptions = {
    lockY?: boolean;
};

export class Draggable extends Component {
    lockY: boolean;

    constructor({ lockY = true }: DraggableOptions = {}) {
        super();
        this.lockY = lockY;
    }
}