import { Component } from "src/engine/ecs/Component";

export class Selectable extends Component {
    selected: boolean;

    constructor(selected = false) {
        super();
        this.selected = selected;
    }
}