/**
 * wallItemTopology.test — accessor đọc/ghi topology opening/mount qua một đường chung.
 * Khoá bất biến: trả `side` THẬT (không hard-code 1 cho opening).
 */
import { describe, it, expect } from "vitest";
import { World } from "src/engine/ecs/World";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { getWallItemTopology, setWallItemTopology } from "src/engine/adapters/wallItemTopology";

describe("getWallItemTopology", () => {
    it("opening → kind=opening, side THẬT (kể cả -1, không hard-code 1)", () => {
        const w = new World();
        const e = w.createEntity();
        w.addComponent(e, new WallOpening("A", 0.3, 0.9, 2.1, 0, -1));
        expect(getWallItemTopology(w, e)).toEqual({ kind: "opening", hostWallId: "A", t: 0.3, side: -1 });
    });

    it("mount → kind=mount, đọc đủ hostWallId/t/side", () => {
        const w = new World();
        const e = w.createEntity();
        w.addComponent(e, new WallMounted("B", 0.7, -1, 1.3));
        expect(getWallItemTopology(w, e)).toEqual({ kind: "mount", hostWallId: "B", t: 0.7, side: -1 });
    });

    it("entity không phải wall-item → null", () => {
        const w = new World();
        expect(getWallItemTopology(w, w.createEntity())).toBeNull();
    });
});

describe("setWallItemTopology", () => {
    it("ghi từng field (partial) vào đúng component opening", () => {
        const w = new World();
        const e = w.createEntity();
        w.addComponent(e, new WallOpening("A", 0.3, 0.9, 2.1, 0, 1));
        setWallItemTopology(w, e, { t: 0.6 });
        const wo = w.getComponent(e, WallOpening)!;
        expect(wo.t).toBeCloseTo(0.6);
        expect(wo.side).toBe(1); // không đụng field không truyền
        setWallItemTopology(w, e, { hostWallId: "C", side: -1 });
        expect(wo.hostWallId).toBe("C");
        expect(wo.side).toBe(-1);
    });

    it("ghi vào mount + no-op nếu không phải wall-item", () => {
        const w = new World();
        const e = w.createEntity();
        w.addComponent(e, new WallMounted("B", 0.5, 1, 1.3));
        setWallItemTopology(w, e, { t: 0.2, side: -1, hostWallId: "B2" });
        const wm = w.getComponent(e, WallMounted)!;
        expect(wm).toMatchObject({ hostWallId: "B2", t: 0.2, side: -1 });
        expect(() => setWallItemTopology(w, w.createEntity(), { t: 0.9 })).not.toThrow();
    });
});
