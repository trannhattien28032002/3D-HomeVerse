/**
 * floorClamp.test — clampCenterAboveFloor: đáy vật không tụt xuống dưới sàn.
 *
 * center-Y được clamp sao cho (center - halfHeight) >= floorY. Hàm pure, không phụ
 * thuộc Three/ECS → test trực tiếp số học, không cần kéo gizmo.
 */
import { describe, it, expect } from "vitest";
import { clampCenterAboveFloor } from "src/engine/systems/gizmo/gizmoHandles";

describe("clampCenterAboveFloor", () => {
    it("nâng center lên khi đáy chui xuống dưới sàn (y=0)", () => {
        // center=-2, half=1 → đáy=-3 < 0 → clamp center về half=1 (đáy về 0)
        expect(clampCenterAboveFloor(-2, 1)).toBe(1);
    });

    it("giữ nguyên center khi đáy đã ở trên sàn", () => {
        // center=5, half=1 → đáy=4 >= 0 → không đổi
        expect(clampCenterAboveFloor(5, 1)).toBe(5);
    });

    it("đáy chạm đúng sàn thì giữ nguyên (biên)", () => {
        // center=1, half=1 → đáy=0 → đã hợp lệ
        expect(clampCenterAboveFloor(1, 1)).toBe(1);
    });

    it("clamp về đúng half khi center=0 (vật xuyên một nửa xuống sàn)", () => {
        expect(clampCenterAboveFloor(0, 1)).toBe(1);
    });

    it("collider null → halfHeight 0 → clamp center về chính floorY", () => {
        expect(clampCenterAboveFloor(-0.5, 0)).toBe(0);
        expect(clampCenterAboveFloor(0.5, 0)).toBe(0.5);
    });

    it("tôn trọng floorY tuỳ biến (multi-floor tương lai)", () => {
        // sàn ở y=3, half=0.5 → đáy phải >= 3 → center >= 3.5
        expect(clampCenterAboveFloor(3.2, 0.5, 3)).toBe(3.5);
        expect(clampCenterAboveFloor(10, 0.5, 3)).toBe(10);
    });
});
