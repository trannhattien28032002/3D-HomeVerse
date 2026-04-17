import { Component } from "../ecs/Component";

export class Selectable extends Component {
    selected: boolean;

    constructor(selected = false) {
        super();
        this.selected = selected;
    }
}