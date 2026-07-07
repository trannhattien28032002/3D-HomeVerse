/**
 * furnishRoom.test — WP4. Bày đồ qua solver → PLACE_FURNITURE qua dispatcher THẬT.
 *
 * Lưu ý: spawnFurnitureGLB cần GLTF loader thật (await load TRƯỚC khi tạo entity)
 * nên trong harness headless furniture KHÔNG materialize được → verify trên kết quả
 * solver (out.placed) là nguồn sự thật cho "không chồng / trong phòng". Phần spawn
 * thực đi cùng đường placeFurniture (WP1, verify live).
 */
import { describe, it, expect } from "vitest";
import { buildEngineHarness, type EngineHarness } from "src/ai/test/engineHarness";
import { createRoomTool } from "src/ai/tools/createRoom";
import { furnishRoomTool } from "src/ai/tools/furnishRoom";
import { describeScene } from "src/ai/perception/describeScene";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { checkNoOverlap, checkInsideRoom } from "src/ai/eval/spatialAssertions";
import type { Placement, SolverRoom } from "src/ai/solver";

async function makeRoom(h: EngineHarness, x: number, z: number, w: number, d: number): Promise<string> {
    await createRoomTool.handler({ x, z, width: w, depth: d }, { api: h.api, perception: h.perception });
    return describeScene(h.perception).rooms[0].key;
}

describe("furnishRoom", () => {
    it("phòng khách 4×5: sofa + bàn + ghế → solver đặt không chồng, trong phòng", async () => {
        const h = buildEngineHarness();
        const key = await makeRoom(h, 0, 0, 4, 5);
        const scene = describeScene(h.perception);

        const raw = await furnishRoomTool.handler({
            roomKey: key,
            items: [
                { modelId: "sofa-d", against: "west-wall", clearance: 0.4 },
                { modelId: "table-c", against: "center", clearance: 0.3 },
                { modelId: "chair-D-01", against: "east-wall", clearance: 0.3 },
            ],
        }, { api: h.api, perception: h.perception });
        const out = JSON.parse(raw);

        expect(out.ok).toBe(true);
        expect(out.placed.length).toBeGreaterThanOrEqual(2);

        const placed: Placement[] = out.placed;
        expect(checkNoOverlap(placed, getFootprint2D)).toEqual([]);
        const room: SolverRoom = {
            bbox: scene.rooms[0].bbox, points: [], centroid: scene.rooms[0].centroid, wallThickness: 0.12,
        };
        expect(checkInsideRoom(placed, getFootprint2D, room)).toEqual([]);
    });

    it("đồ bám tường (door-a) → skipped, không spawn", async () => {
        const h = buildEngineHarness();
        const key = await makeRoom(h, 0, 0, 4, 4);

        const raw = await furnishRoomTool.handler({
            roomKey: key,
            items: [{ modelId: "door-a", against: "north-wall" }],
        }, { api: h.api, perception: h.perception });
        const out = JSON.parse(raw);

        expect(out.placed).toEqual([]);
        expect(out.skipped.map((s: { modelId: string }) => s.modelId)).toContain("door-a");
        expect(describeScene(h.perception).furniture).toHaveLength(0);
    });

    it("roomKey không tồn tại → lỗi", async () => {
        const h = buildEngineHarness();
        await expect(
            furnishRoomTool.handler({ roomKey: "x,y,z,w", items: [{ modelId: "sofa-d" }] }, { api: h.api, perception: h.perception }),
        ).rejects.toThrow();
    });
});
