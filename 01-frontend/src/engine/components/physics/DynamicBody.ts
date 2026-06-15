import { Component } from "src/engine/ecs/Component.js";

/**
 * DynamicBody — tag đánh dấu entity là vật ĐỘNG (nội thất người dùng kéo).
 *
 * Va chạm: mỗi frame CannonCollisionSystem sweep entity này từ safePos tới vị
 * trí mới, clamp lại trước khi đụng StaticBody → không cho xuyên tường/đồ khác.
 */
export class DynamicBody extends Component {
    constructor() {
        super();
    }
}