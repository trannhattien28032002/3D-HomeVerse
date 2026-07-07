/**
 * styleResolver.test — WP5. style+role → material/model thật + recipe→intents,
 * và end-to-end: intents do StyleResolver sinh → solveLayout đặt KHÔNG chồng.
 */
import { describe, it, expect } from "vitest";
import {
    getStylePack, listStyleIds, pickFloorMaterial, pickWallMaterial,
    materialsMatchingTarget, pickModelForRole, recipeToIntents,
} from "src/ai/style";
import materialTagsJson from "src/ai/data/material-tags.json";
import objectTagsJson from "src/ai/data/object-tags.json";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { solveLayout } from "src/ai/solver";
import type { SolverRoom } from "src/ai/solver";
import { checkNoOverlap, checkInsideRoom } from "src/ai/eval/spatialAssertions";

const MAT = (materialTagsJson as { tags: Record<string, { lightness: string; temperature: string }> }).tags;
const OBJ = (objectTagsJson as { tags: Record<string, { category: string; style: string[] }> }).tags;

function rectRoom(w: number, d: number): SolverRoom {
    return {
        bbox: { minX: 0, minZ: 0, maxX: w, maxZ: d },
        points: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
        centroid: { x: w / 2, z: d / 2 }, wallThickness: 0.12,
    };
}

describe("styleResolver — material", () => {
    it("getStylePack: id sai → throw; id đúng → pack", () => {
        expect(() => getStylePack("khong-co")).toThrow();
        expect(getStylePack("scandinavian").label).toBe("Scandinavian");
    });

    it("pickFloorMaterial khớp floorTarget (2 trục)", () => {
        const p = getStylePack("scandinavian");
        const id = pickFloorMaterial("scandinavian", "living");
        expect(MAT[id]).toBeDefined();
        expect(p.floorTarget.lightness).toContain(MAT[id].lightness);
        expect(p.floorTarget.temperature).toContain(MAT[id].temperature);
    });

    it("phòng ướt dùng override (bath/kitchen)", () => {
        const p = getStylePack("scandinavian");
        expect(pickFloorMaterial("scandinavian", "bathroom")).toBe(p.palette.bathFloor);
        expect(pickWallMaterial("scandinavian", "bathroom")).toBe(p.palette.bathWall);
        expect(pickFloorMaterial("scandinavian", "kitchen")).toBe(p.palette.kitchenFloor);
    });

    it("materialsMatchingTarget: không rỗng, mọi món thoả target & loại avoid", () => {
        const p = getStylePack("minimalist");
        const ids = materialsMatchingTarget("minimalist", "floor");
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
            expect(p.floorTarget.lightness).toContain(MAT[id].lightness);
            expect(p.avoid.lightness).not.toContain(MAT[id].lightness);
        }
    });
});

describe("styleResolver — model", () => {
    it("pickModelForRole(sofas) trả sofa thật; industrial ưu tiên style khớp", () => {
        const id = pickModelForRole("industrial", "sofas");
        expect(id).not.toBeNull();
        expect(OBJ[id!].category).toBe("sofas");
        // sofa-d có style ⊇ industrial → điểm cao hơn các sofa khác
        expect(OBJ[id!].style.includes("industrial") || OBJ[id!].style.length === 0).toBe(true);
    });

    it("filter ràng buộc tập ứng viên", () => {
        const id = pickModelForRole("japandi", "miscellaneous", { filter: ["plant-a", "plant-b"] });
        expect(["plant-a", "plant-b"]).toContain(id);
    });

    it("category không có món → null", () => {
        expect(pickModelForRole("modern", "khong-co-category")).toBeNull();
    });
});

describe("recipeToIntents", () => {
    it("bedroom: bed→north-wall, nightstand→2 góc bắc, thảm→underlay (B3)", () => {
        const { intents, mounted } = recipeToIntents("scandinavian", "bedroom");
        const bed = intents.find((i) => i.modelId.startsWith("bed"));
        expect(bed?.against).toBe("north-wall");
        const ns = intents.filter((i) => i.against?.startsWith("corner-n"));
        expect(ns.length).toBeGreaterThanOrEqual(2);
        expect(mounted).toEqual([]);
        // B3: thảm KHÔNG còn bị bỏ — phát ra intent lớp underlay (neo trước giường).
        const rug = intents.find((i) => i.layer === "underlay");
        expect(rug).toBeDefined();
        expect(rug?.anchorTo).toBe(bed?.modelId);
        for (const it of intents) expect(OBJ[it.modelId]).toBeDefined(); // id thật
    });

    it("living: tv → đồ sàn ở tường ĐỐI DIỆN sofa (B3, không mounted)", () => {
        const { intents, mounted } = recipeToIntents("modern", "living");
        expect(mounted.some((m) => m.role === "tv")).toBe(false); // TV catalog là đồ sàn
        const tv = intents.find((i) => OBJ[i.modelId]?.category === "electronics");
        expect(tv).toBeDefined();
        // sofa = món against:wall đầu → mainWall = north (WALL_ORDER[0]); TV đối diện = south.
        expect(tv?.against).toBe("south-wall");
    });

    it("kitchen: counterRun → nhiều intent cùng 1 tường, align tăng dần", () => {
        const { intents } = recipeToIntents("scandinavian", "kitchen");
        const run = intents.filter((i) => i.clearance === 0 && i.against?.endsWith("-wall"));
        expect(run.length).toBeGreaterThanOrEqual(3);
        const walls = new Set(run.map((i) => i.against));
        expect(walls.size).toBe(1); // cùng 1 tường
    });
});

describe("end-to-end: StyleResolver intents → solveLayout không chồng", () => {
    it("phòng ngủ 3.5×4 Scandinavian: solver đặt không chồng, trong phòng", () => {
        const room = rectRoom(3.5, 4);
        const { intents } = recipeToIntents("scandinavian", "bedroom");
        const res = solveLayout(room, intents, { getFootprint: getFootprint2D });
        expect(res.placed.length).toBeGreaterThan(0);
        expect(checkNoOverlap(res.placed, getFootprint2D)).toEqual([]);
        expect(checkInsideRoom(res.placed, getFootprint2D, room)).toEqual([]);
    });

    it("phòng khách 5×5 Japandi: không chồng", () => {
        const room = rectRoom(5, 5);
        const { intents } = recipeToIntents("japandi", "living");
        const res = solveLayout(room, intents, { getFootprint: getFootprint2D });
        expect(checkNoOverlap(res.placed, getFootprint2D)).toEqual([]);
        expect(checkInsideRoom(res.placed, getFootprint2D, room)).toEqual([]);
    });
});
