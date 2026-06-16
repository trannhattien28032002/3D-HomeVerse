import { Component } from "src/engine/ecs/Component.js";

/**
 * StaticBody — tag đánh dấu entity là vật cản TĨNH (tường, đồ cố định).
 *
 * Va chạm: entity có StaticBody được tạo body bất động trong physics world và
 * dùng làm chướng ngại để các DynamicBody không xuyên qua.
 */
export class StaticBody extends Component {
    constructor() {
        super();
    }
}