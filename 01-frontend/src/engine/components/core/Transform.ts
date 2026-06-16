import { Component } from "src/engine/ecs/Component";

/**
 * Transform — vị trí + hướng xoay của một entity trong không gian 3D.
 *
 * Quaternion (qx,qy,qz,qw) là "nguồn sự thật" cho hướng xoay — cùng quy ước với
 * Three.js và cannon-es, tránh hiện tượng gimbal lock. Góc yaw (rotY) chỉ là một
 * lớp tiện ích đọc/ghi quanh trục Y, dùng cho tường và đặt đồ ở chế độ 2D.
 */
export class Transform extends Component {
    x: number;
    y: number;
    z: number;
    // Quaternion là nguồn sự thật của hướng xoay (x,y,z,w — chuẩn Three.js / cannon-es).
    qx = 0;
    qy = 0;
    qz = 0;
    qw = 1;

    constructor(x = 0, y = 0, z = 0, rotY = 0) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
        // Các field initializer phía trên chạy TRƯỚC dòng này, nên qx/qy/qz/qw = 0/0/0/1.
        this.rotY = rotY;
    }

    /** Trích góc yaw quanh trục Y từ quaternion (cùng công thức GizmoSystem từng dùng). */
    get rotY(): number {
        return Math.atan2(
            2 * (this.qw * this.qy + this.qx * this.qz),
            1 - 2 * (this.qy * this.qy + this.qx * this.qx),
        );
    }

    /** Đặt quaternion chỉ-yaw, xoá mọi pitch/roll. Dùng cho tường và đặt đồ 2D. */
    set rotY(rad: number) {
        const half = rad / 2;
        this.qx = 0;
        this.qy = Math.sin(half);
        this.qz = 0;
        this.qw = Math.cos(half);
    }

    /** Đặt xoay đầy đủ 3 trục. Gizmo dùng để hỗ trợ pitch/roll. */
    setQuaternion(x: number, y: number, z: number, w: number): void {
        this.qx = x;
        this.qy = y;
        this.qz = z;
        this.qw = w;
    }
}
