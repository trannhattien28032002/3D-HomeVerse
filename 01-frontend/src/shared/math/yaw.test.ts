import { describe, it, expect } from "vitest";

import { yawToQuat, quatToYaw, setYawQuaternion } from "src/shared/math/yaw";

describe("yaw helpers", () => {
    it("yawToQuat tạo quaternion yaw-thuần (qx = qz = 0)", () => {
        const q = yawToQuat(Math.PI / 2);
        expect(q.x).toBe(0);
        expect(q.z).toBe(0);
        expect(q.y).toBeCloseTo(Math.SQRT1_2, 12);
        expect(q.w).toBeCloseTo(Math.SQRT1_2, 12);
    });

    it("quatToYaw nghịch đảo yawToQuat trong [-π, π]", () => {
        for (const yaw of [0, 0.3, 1, -1, Math.PI / 2, -Math.PI / 2, 2.5, -2.5]) {
            const q = yawToQuat(yaw);
            expect(quatToYaw(q.x, q.y, q.z, q.w)).toBeCloseTo(yaw, 12);
        }
    });

    it("quatToYaw trên quaternion yaw-thuần khớp dạng rút gọn 2*atan2(qy,qw)", () => {
        for (const yaw of [0.2, -0.7, 1.4]) {
            const q = yawToQuat(yaw);
            expect(quatToYaw(q.x, q.y, q.z, q.w)).toBeCloseTo(2 * Math.atan2(q.y, q.w), 12);
        }
    });

    it("setYawQuaternion ghi đúng vào object có .quaternion.set", () => {
        const calls: number[][] = [];
        const obj = { quaternion: { set: (x: number, y: number, z: number, w: number) => { calls.push([x, y, z, w]); } } };
        setYawQuaternion(obj, Math.PI / 2);
        expect(calls).toHaveLength(1);
        const [x, y, z, w] = calls[0];
        expect(x).toBe(0);
        expect(z).toBe(0);
        expect(y).toBeCloseTo(Math.SQRT1_2, 12);
        expect(w).toBeCloseTo(Math.SQRT1_2, 12);
    });
});
