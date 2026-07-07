/**
 * layoutSolver.test — WP4 + WP4-EVAL Tầng A.
 *
 * Dùng getFootprint2D THẬT (đọc objects.json, thuần) + spatialAssertions để
 * verify bố cục: không chồng / trong phòng / chừa lối / không chặn cửa.
 * Không cần engine/LLM → chạy nhanh.
 */
import { describe, it, expect } from "vitest";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { resolveAnchor, solveLayout, footprintRect } from "src/ai/solver";
import type { SolverRoom, PlacementIntent } from "src/ai/solver";
import {
    checkNoOverlap, checkInsideRoom, checkWalkway, checkDoorClear,
} from "src/ai/eval/spatialAssertions";
import { adaptiveGridStep, spiralGridCandidates } from "src/ai/solver/layoutSolver";

const fp = getFootprint2D;

/** Phòng chữ nhật trục XZ từ bbox. */
function rectRoom(minX: number, minZ: number, maxX: number, maxZ: number, wallThickness = 0.12): SolverRoom {
    return {
        bbox: { minX, minZ, maxX, maxZ },
        points: [
            { x: minX, z: minZ }, { x: maxX, z: minZ },
            { x: maxX, z: maxZ }, { x: minX, z: maxZ },
        ],
        centroid: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
        wallThickness,
    };
}

describe("anchors — calibration (TD-5)", () => {
    const room = rectRoom(0, 0, 4, 4);
    const F = { width: 1, depth: 1 };

    it("north-wall: quay vào phòng = +Z (rotY 0), sát minZ", () => {
        const p = resolveAnchor(room, { modelId: "x", against: "north-wall" }, F);
        expect(p.rotY).toBeCloseTo(0);
        expect(p.z).toBeCloseTo(0 + 0.06 + 0.5); // wallT/2 + depth/2
    });
    it("west-wall: quay +X (rotY π/2), sát minX", () => {
        const p = resolveAnchor(room, { modelId: "x", against: "west-wall" }, F);
        expect(p.rotY).toBeCloseTo(Math.PI / 2);
        expect(p.x).toBeCloseTo(0.06 + 0.5);
    });
    it("south-wall: quay −Z (rotY π); east-wall: quay −X (rotY 3π/2)", () => {
        expect(resolveAnchor(room, { modelId: "x", against: "south-wall" }, F).rotY).toBeCloseTo(Math.PI);
        expect(resolveAnchor(room, { modelId: "x", against: "east-wall" }, F).rotY).toBeCloseTo((3 * Math.PI) / 2);
    });
    it("facing số minh thị override", () => {
        const p = resolveAnchor(room, { modelId: "x", against: "north-wall", facing: 1.23 }, F);
        expect(p.rotY).toBeCloseTo(1.23);
    });
});

describe("solveLayout — golden scenes", () => {
    it("① phòng ngủ 3×4: giường áp bắc + tủ cạnh + ghế góc — không chồng, trong phòng", () => {
        const room = rectRoom(0, 0, 3, 4);
        const intents: PlacementIntent[] = [
            { modelId: "bed-double-01", against: "north-wall", clearance: 0.4 },
            { modelId: "drawer-b", against: "west-wall", align: 0.85, clearance: 0.2 },
            { modelId: "chair-D-01", against: "corner-se", clearance: 0.2 },
        ];
        const res = solveLayout(room, intents, { getFootprint: fp });
        expect(res.skipped).toEqual([]);
        expect(res.placed).toHaveLength(3);
        expect(checkNoOverlap(res.placed, fp)).toEqual([]);
        expect(checkInsideRoom(res.placed, fp, room)).toEqual([]);
    });

    it("② phòng khách 4×5: sofa tây + bàn giữa + TV đông — không chồng, chừa lối ≥0.3m", () => {
        const room = rectRoom(0, 0, 4, 5);
        const intents: PlacementIntent[] = [
            { modelId: "sofa-d", against: "west-wall", clearance: 0.4 },
            { modelId: "table-c", against: "center", clearance: 0.3 },
            { modelId: "television-b", against: "east-wall", clearance: 0.3 },
        ];
        const res = solveLayout(room, intents, { getFootprint: fp });
        expect(res.placed.length).toBeGreaterThanOrEqual(2);
        expect(checkNoOverlap(res.placed, fp)).toEqual([]);
        expect(checkInsideRoom(res.placed, fp, room)).toEqual([]);
        expect(checkWalkway(res.placed, fp, 0.3)).toEqual([]);
    });

    it("③ phòng nhỏ 2×2: sofa lớn KHÔNG vừa → skipped (không đặt liều)", () => {
        const room = rectRoom(0, 0, 2, 2);
        const res = solveLayout(room, [{ modelId: "sofa-d", against: "north-wall" }], { getFootprint: fp });
        expect(res.placed).toEqual([]);
        expect(res.skipped.map((s) => s.modelId)).toContain("sofa-d");
    });

    it("B4: món áp tường kẹt (cả dải tường bị chặn) → skip, KHÔNG trôi ra giữa phòng", () => {
        const room = rectRoom(0, 0, 4, 4);
        // Chặn kín dải tường bắc (z gần minZ) bằng obstacle dài hết bề ngang.
        const block = { rect: { minX: 0, minZ: 0, maxX: 4, maxZ: 1.4 }, kind: "furniture" as const };
        const res = solveLayout(room, [{ modelId: "drawer-b", against: "north-wall", clearance: 0.2 }], {
            getFootprint: fp, existing: [block],
        });
        expect(res.placed).toEqual([]); // không đặt liều giữa phòng
        expect(res.skipped.map((s) => s.modelId)).toContain("drawer-b");
    });

    it("④ không chặn cửa: vùng clearance trước cửa không bị đồ đè", () => {
        const room = rectRoom(0, 0, 4, 4);
        // Cửa ở tường nam, clearance 0.9m vào phòng quanh x∈[1.5,2.5].
        const doorClear = { minX: 1.5, minZ: 4 - 0.9 - 0.06, maxX: 2.5, maxZ: 4 };
        const intents: PlacementIntent[] = [
            { modelId: "bed-double-01", against: "north-wall", clearance: 0.4 },
            { modelId: "drawer-b", against: "west-wall", clearance: 0.3 },
        ];
        const res = solveLayout(room, intents, {
            getFootprint: fp,
            existing: [{ rect: doorClear, kind: "opening-clearance" }],
        });
        expect(checkNoOverlap(res.placed, fp)).toEqual([]);
        expect(checkDoorClear(res.placed, fp, [doorClear])).toEqual([]);
    });
});

describe("solveLayout — neo tương đối (B1/B2)", () => {
    it("B2 front: bàn trà neo TRƯỚC sofa (sofa tây → bàn nằm phía +X), không chồng", () => {
        const room = rectRoom(0, 0, 4, 5);
        const intents: PlacementIntent[] = [
            { modelId: "sofa-d", against: "west-wall", clearance: 0.3 },
            { modelId: "table-c", anchorTo: "sofa-d", relation: "front", clearance: 0.2 },
        ];
        const res = solveLayout(room, intents, { getFootprint: fp });
        expect(res.placed).toHaveLength(2);
        const sofa = res.placed.find((p) => p.modelId === "sofa-d")!;
        const table = res.placed.find((p) => p.modelId === "table-c")!;
        expect(table.x).toBeGreaterThan(sofa.x); // sofa tây quay +X → bàn ở phía trong (+X)
        expect(checkNoOverlap(res.placed, fp)).toEqual([]);
        expect(checkInsideRoom(res.placed, fp, room)).toEqual([]);
    });

    it("B1 around: 4 ghế vây quanh bàn ở 4 cạnh khác nhau, không chồng", () => {
        const room = rectRoom(0, 0, 6, 6);
        const intents: PlacementIntent[] = [
            { modelId: "table-c", against: "center", clearance: 0.2 },
            ...Array.from({ length: 4 }, () => (
                { modelId: "chair-D-01", anchorTo: "table-c", relation: "around" as const, clearance: 0 }
            )),
        ];
        const res = solveLayout(room, intents, { getFootprint: fp });
        const chairs = res.placed.filter((p) => p.modelId === "chair-D-01");
        expect(chairs.length).toBeGreaterThanOrEqual(4); // đủ 4 cạnh
        expect(checkNoOverlap(res.placed, fp)).toEqual([]);
        expect(checkInsideRoom(res.placed, fp, room)).toEqual([]);
        // 4 ghế ở 4 vị trí PHÂN BIỆT (không dồn 1 chỗ như M1 cũ).
        const uniq = new Set(chairs.map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`));
        expect(uniq.size).toBe(chairs.length);
    });

    it("B2: ref không đặt được → món neo tương đối bị skip (không văng bừa)", () => {
        const room = rectRoom(0, 0, 4, 4);
        const intents: PlacementIntent[] = [
            { modelId: "table-c", anchorTo: "ghost-model", relation: "front" },
        ];
        const res = solveLayout(room, intents, { getFootprint: fp });
        expect(res.placed).toEqual([]);
        expect(res.skipped.map((s) => s.modelId)).toContain("table-c");
    });
});

describe("footprintRect — xoay 90° swap đúng", () => {
    it("rotY π/2 hoán đổi width↔depth của AABB", () => {
        const r0 = footprintRect(0, 0, 0, { width: 2, depth: 1 });
        expect([r0.maxX - r0.minX, r0.maxZ - r0.minZ]).toEqual([2, 1]);
        const r90 = footprintRect(0, 0, Math.PI / 2, { width: 2, depth: 1 });
        expect(r90.maxX - r90.minX).toBeCloseTo(1);
        expect(r90.maxZ - r90.minZ).toBeCloseTo(2);
    });
});

describe("AI solver perf (BAO-CAO-REVIEW-DA-CHIEU.md #2/#6) — GRID_STEP thích ứng + spiral", () => {
    it("adaptiveGridStep: giữ nguyên GRID_STEP mặc định (0.25) cho phòng thường (≤10m)", () => {
        const b = { minX: 0, minZ: 0, maxX: 4, maxZ: 5 };
        expect(adaptiveGridStep(b)).toBeCloseTo(0.25);
    });

    it("adaptiveGridStep: nới rộng cho phòng lớn để trần số ô lưới mỗi cạnh không vượt quá ~40", () => {
        const b = { minX: 0, minZ: 0, maxX: 40, maxZ: 20 }; // nhà nhiều phòng do AI generateHouse gộp bbox
        const step = adaptiveGridStep(b);
        expect(step).toBeGreaterThan(0.25);
        const cellsAlongLongestSpan = Math.floor((b.maxX - b.minX) / step);
        expect(cellsAlongLongestSpan).toBeLessThanOrEqual(40);
    });

    it("spiralGridCandidates: ứng viên đầu tiên là ô GẦN seed nhất (không phải góc phòng như raster cũ)", () => {
        const b = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 };
        const first = spiralGridCandidates(b, { x: 2, z: 2 }, 0.5).next().value!;
        expect(first).toEqual({ x: 2, z: 2 });
    });

    it("spiralGridCandidates: phủ đúng số ô như raster cũ (chỉ đổi thứ tự, không mất/thêm ô)", () => {
        const b = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 };
        const step = 0.5;
        const spiralCells = new Set(
            Array.from(spiralGridCandidates(b, { x: 0.7, z: 3.1 }, step), (c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
        );
        const rasterCells = new Set<string>();
        for (let x = b.minX; x <= b.maxX; x += step) {
            for (let z = b.minZ; z <= b.maxZ; z += step) {
                rasterCells.add(`${x.toFixed(3)},${z.toFixed(3)}`);
            }
        }
        expect(spiralCells).toEqual(rasterCells);
    });

    it("solveLayout: món center vẫn được đặt dù chỗ trống DUY NHẤT nằm xa điểm lý tưởng (spiral fallback không bỏ sót ô)", () => {
        const room = rectRoom(0, 0, 4, 4, 0);
        // Chặn gần hết phòng, chỉ chừa dải hẹp sát góc tây-bắc (xa tâm phòng — điểm "lý tưởng" của against:center).
        const block = { rect: { minX: 0.6, minZ: 0, maxX: 4, maxZ: 4 }, kind: "furniture" as const };
        const res = solveLayout(
            room,
            [{ modelId: "chair-D-01", against: "center", clearance: 0 }],
            { getFootprint: () => ({ width: 0.3, depth: 0.3 }), existing: [block] },
        );
        expect(res.skipped).toEqual([]);
        expect(res.placed).toHaveLength(1);
        expect(res.placed[0].x).toBeLessThan(0.6);
    });
});
