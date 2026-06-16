import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    SNAP_M,
    ROT_STEP_DEG,
    snapToGridM,
    snapAngleDeg,
    snapAngleRad,
    setSnapM,
} from "src/shared/constants/placement";
import { konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";

describe("snapToGridM", () => {
    // Lưới hoạt động giờ chỉnh được runtime (setSnapM); SNAP_M mặc định = 0.01.
    // Pin 0.25 để kiểm tra hành vi làm tròn ở một lưới đã biết, khôi phục mặc định sau.
    const GRID = 0.25;
    beforeEach(() => setSnapM(GRID));
    afterEach(() => setSnapM(SNAP_M));

    it("snaps to nearest multiple of the active grid", () => {
        expect(snapToGridM(0.1)).toBeCloseTo(0);
        expect(snapToGridM(0.13)).toBeCloseTo(0.25);
        expect(snapToGridM(0.62)).toBeCloseTo(0.5);
        expect(snapToGridM(0.63)).toBeCloseTo(0.75);
    });
    it("handles negatives", () => {
        expect(snapToGridM(-0.13)).toBeCloseTo(-0.25);
        expect(snapToGridM(-0.12)).toBeCloseTo(0);
    });
    it("is idempotent on grid values", () => {
        for (const v of [0, GRID, 2 * GRID, -3 * GRID]) {
            expect(snapToGridM(v)).toBeCloseTo(v);
        }
    });
});

describe("snapAngleDeg", () => {
    it("snaps to nearest ROT_STEP_DEG", () => {
        expect(snapAngleDeg(7)).toBe(0);
        expect(snapAngleDeg(8)).toBe(ROT_STEP_DEG);
        expect(snapAngleDeg(22)).toBe(ROT_STEP_DEG);
        expect(snapAngleDeg(23)).toBe(2 * ROT_STEP_DEG);
        expect(snapAngleDeg(90)).toBe(90);
    });
});

describe("snapAngleRad", () => {
    it("snaps cardinal angles exactly", () => {
        for (const deg of [0, 90, 180, 270, -90]) {
            const rad = (deg * Math.PI) / 180;
            expect(snapAngleRad(rad)).toBeCloseTo(rad);
        }
    });
    it("snaps near-cardinal to cardinal", () => {
        const near90 = (88 * Math.PI) / 180;
        expect(snapAngleRad(near90)).toBeCloseTo(Math.PI / 2);
    });
});

describe("rotation round-trip 2D↔3D (R2)", () => {
    it("is stable at cardinal angles", () => {
        for (const deg of [0, 90, 180, 270]) {
            const rotY = (deg * Math.PI) / 180;
            const roundTrip = snapAngleRad(konvaDegToThreeRotY(threeRotYToKonvaDeg(rotY)));
            expect(roundTrip).toBeCloseTo(rotY);
        }
    });
});
