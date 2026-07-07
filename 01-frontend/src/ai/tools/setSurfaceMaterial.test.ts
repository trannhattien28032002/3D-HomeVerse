/**
 * setSurfaceMaterial.test — WP7. Build command đúng + guard materialId/roomKey/wallId.
 */
import { describe, it, expect } from "vitest";
import { surfaceMaterialCommands, isKnownMaterial } from "src/ai/tools/setSurfaceMaterial";

describe("surfaceMaterialCommands", () => {
    it("floor → SET_FLOOR_MATERIAL với roomKey", () => {
        const cmds = surfaceMaterialCommands({ surface: "floor", roomKey: "a,b,c,d", materialId: "WoodFloor051" });
        expect(cmds).toEqual([{ type: "SET_FLOOR_MATERIAL", roomKey: "a,b,c,d", materialId: "WoodFloor051" }]);
    });

    it("wall mặc định sơn CẢ 2 mặt (left+right)", () => {
        const cmds = surfaceMaterialCommands({ surface: "wall", wallId: "w1", materialId: "PaintedPlaster017" });
        expect(cmds).toHaveLength(2);
        expect(cmds.map((c) => (c as { face: string }).face).sort()).toEqual(["left", "right"]);
    });

    it("wall face cụ thể → 1 lệnh", () => {
        const cmds = surfaceMaterialCommands({ surface: "wall", wallId: "w1", materialId: "PaintedPlaster017", face: "left" });
        expect(cmds).toHaveLength(1);
    });

    it("materialId bịa → throw", () => {
        expect(() => surfaceMaterialCommands({ surface: "floor", roomKey: "k", materialId: "KHONG-CO" })).toThrow();
    });

    it("floor thiếu roomKey / wall thiếu wallId → throw", () => {
        expect(() => surfaceMaterialCommands({ surface: "floor", materialId: "WoodFloor051" })).toThrow();
        expect(() => surfaceMaterialCommands({ surface: "wall", materialId: "WoodFloor051" })).toThrow();
    });

    it("isKnownMaterial", () => {
        expect(isKnownMaterial("WoodFloor051")).toBe(true);
        expect(isKnownMaterial("nope")).toBe(false);
    });
});
