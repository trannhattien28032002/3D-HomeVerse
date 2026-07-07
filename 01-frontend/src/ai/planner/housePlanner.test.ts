/**
 * housePlanner.test — WP6. Tiling: phủ kín, không chồng, đúng số phòng, tỉ lệ diện tích.
 */
import { describe, it, expect } from "vitest";
import { planHouse, computeAdjacencies, type HouseBrief, type Rect4 } from "src/ai/planner/housePlanner";

const areaOf = (r: Rect4) => (r[2] - r[0]) * (r[3] - r[1]);
function overlaps(a: Rect4, b: Rect4): boolean {
    return a[0] < b[2] - 1e-9 && a[2] > b[0] + 1e-9 && a[1] < b[3] - 1e-9 && a[3] > b[1] + 1e-9;
}

describe("planHouse — tiling", () => {
    const brief: HouseBrief = {
        style: "scandinavian",
        totalAreaM2: 60,
        rooms: [
            { type: "living", count: 1 },
            { type: "bedroom", count: 2 },
            { type: "kitchen", count: 1 },
            { type: "bathroom", count: 1 },
        ],
    };

    it("đúng tổng số phòng (theo count)", () => {
        const plan = planHouse(brief);
        expect(plan.rooms).toHaveLength(5); // 1+2+1+1
    });

    it("phủ KÍN footprint (Σ diện tích phòng = diện tích footprint)", () => {
        const plan = planHouse(brief);
        const fp = plan.footprint.width * plan.footprint.depth;
        const sum = plan.rooms.reduce((s, r) => s + areaOf(r.rect), 0);
        expect(sum).toBeCloseTo(fp, 5);
        expect(fp).toBeCloseTo(60, 5);
    });

    it("KHÔNG phòng nào chồng nhau", () => {
        const plan = planHouse(brief);
        for (let i = 0; i < plan.rooms.length; i++)
            for (let j = i + 1; j < plan.rooms.length; j++)
                expect(overlaps(plan.rooms[i].rect, plan.rooms[j].rect)).toBe(false);
    });

    it("diện tích ~ tỉ lệ trọng số (living lớn hơn bathroom)", () => {
        const plan = planHouse(brief);
        const living = plan.rooms.find((r) => r.type === "living")!;
        const bath = plan.rooms.find((r) => r.type === "bathroom")!;
        expect(areaOf(living.rect)).toBeGreaterThan(areaOf(bath.rect));
    });

    it("footprint suy từ brief.footprint nếu có", () => {
        const plan = planHouse({ ...brief, footprint: { width: 10, depth: 8 } });
        expect(plan.footprint).toEqual({ width: 10, depth: 8 });
        expect(plan.rooms.reduce((s, r) => s + areaOf(r.rect), 0)).toBeCloseTo(80, 5);
    });

    it("brief rỗng phòng → throw", () => {
        expect(() => planHouse({ style: "modern", rooms: [] })).toThrow();
    });
});

describe("computeAdjacencies", () => {
    it("phát hiện phòng kề (chia đôi → 1 cạnh chung)", () => {
        const plan = planHouse({ style: "modern", footprint: { width: 8, depth: 4 }, rooms: [{ type: "living", count: 2 }] });
        const adj = computeAdjacencies(plan.rooms);
        expect(adj.length).toBeGreaterThanOrEqual(1);
        expect(adj[0].span[1] - adj[0].span[0]).toBeGreaterThan(0.5);
    });
});
