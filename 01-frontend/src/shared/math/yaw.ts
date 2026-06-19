/**
 * yaw.ts — chuyển đổi giữa góc yaw (quanh trục Y) và quaternion.
 *
 * Quaternion (x,y,z,w) cùng quy ước Three.js / cannon-es. Góc yaw (radian, ngược
 * chiều kim đồng hồ) là lớp tiện ích để tường và đặt đồ 2D làm việc với một con số
 * duy nhất thay vì 4 component. Gốc công thức: {@link Transform} (rotY getter/setter).
 */

/** Component quaternion theo thứ tự Three.js / cannon-es. */
export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

/**
 * Góc yaw (radian) → quaternion yaw-thuần (pitch/roll = 0).
 * Nghịch đảo của {@link quatToYaw} cho quaternion yaw-thuần.
 */
export function yawToQuat(yaw: number): Quat {
    const half = yaw / 2;
    return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/**
 * Trích góc yaw quanh trục Y từ một quaternion bất kỳ.
 *
 * Công thức tổng quát (xử lý cả pitch/roll) — cùng công thức `Transform.rotY`.
 * Với quaternion yaw-thuần (qx = qz = 0) kết quả rút gọn về `2*atan2(qy, qw)`,
 * nên thay được cả các call-site đang dùng dạng rút gọn đó.
 */
export function quatToYaw(qx: number, qy: number, qz: number, qw: number): number {
    return Math.atan2(
        2 * (qw * qy + qx * qz),
        1 - 2 * (qy * qy + qx * qx),
    );
}

/**
 * Đặt hướng xoay yaw-thuần lên một object kiểu THREE.Object3D
 * (bất cứ thứ gì có `.quaternion.set(x,y,z,w)`).
 */
export function setYawQuaternion(
    obj: { quaternion: { set(x: number, y: number, z: number, w: number): unknown } },
    yaw: number,
): void {
    const half = yaw / 2;
    obj.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
}
