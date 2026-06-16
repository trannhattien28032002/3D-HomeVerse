import { Component } from "src/engine/ecs/Component.ts";

/**
 * Grounded — đánh dấu entity đang nằm trên mặt sàn.
 *
 * Quan trọng cho va chạm: CannonCollisionSystem LOẠI TRỪ mọi entity Grounded
 * khỏi test chồng lấn, nếu không đồ đặt phẳng trên sàn (thảm, đèn) sẽ bị coi là
 * va chạm vĩnh viễn với collider sàn. coyoteTimer dành cho logic rời sàn tạm thời.
 */
export class Grounded extends Component {
    isGrounded: boolean;
    coyoteTimer: number;

    constructor() {
        super();
        this.isGrounded = true;
        this.coyoteTimer = 0;
    }
}