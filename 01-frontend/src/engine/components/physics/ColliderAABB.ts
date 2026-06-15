import { Component } from "src/engine/ecs/Component";

/**
 * ColliderAABB — hộp bao va chạm của một entity (nửa-kích thước theo 3 trục).
 *
 * Được CannonCollisionSystem dùng làm khuôn cho probe body khi kiểm tra chồng lấn.
 * Lưu kích thước cục bộ; hướng xoay lấy từ Transform.quaternion lúc test.
 */
export class ColliderAABB extends Component {
    width: number;
    height: number;
    depth: number;

    constructor(width = 1, height = 1, depth = 1) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;
    }
}