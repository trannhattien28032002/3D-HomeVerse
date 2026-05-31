import { Component } from "src/engine/ecs/Component.ts";

export class Grounded extends Component {
    isGrounded: boolean;
    coyoteTimer: number;

    constructor() {
        super();
        this.isGrounded = true;
        this.coyoteTimer = 0;
    }
}