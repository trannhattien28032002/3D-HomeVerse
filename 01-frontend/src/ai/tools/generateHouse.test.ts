/**
 * generateHouse.test — WP6. Preview path + dựng thật qua dispatcher headless.
 *
 * Headless: createRoom chạy thật (ENSURE_NODE/ADD_WALL sync) → roomKey hợp lệ;
 * furnish chạy solver (spawn GLB no-op headless). Material/cửa best-effort → vào
 * notes nếu lỗi nhưng KHÔNG vỡ. Verify: nhà dựng được, đúng số phòng, có roomKey.
 */
import { describe, it, expect } from "vitest";
import { buildEngineHarness } from "src/ai/test/engineHarness";
import { generateHouseTool } from "src/ai/tools/generateHouse";
import { describeScene } from "src/ai/perception/describeScene";

const brief = {
    style: "scandinavian",
    footprint: { width: 8, depth: 6 },
    rooms: [{ type: "living", count: 1 }, { type: "bedroom", count: 1 }, { type: "bathroom", count: 1 }],
};

describe("generateHouse — preview", () => {
    it("confirm=false → PREVIEW (không dựng gì)", async () => {
        const h = buildEngineHarness();
        const out = JSON.parse(await generateHouseTool.handler({ brief, confirm: false }, { api: h.api, perception: h.perception }));
        expect(out.preview).toBe(true);
        expect(out.rooms).toHaveLength(3);
        expect(out.message).toMatch(/Xác nhận/);
        expect(describeScene(h.perception).empty).toBe(true); // chưa dựng
    });
});

describe("generateHouse — dựng thật", () => {
    it("confirm=true → dựng 3 phòng, có roomKey, scene có tường", async () => {
        const h = buildEngineHarness();
        const out = JSON.parse(await generateHouseTool.handler({ brief, confirm: true }, { api: h.api, perception: h.perception }));
        expect(out.ok).toBe(true);
        expect(out.rooms).toHaveLength(3);
        for (const r of out.rooms) expect(r.roomKey).toMatch(/,/); // sorted nodeIds
        const scene = describeScene(h.perception);
        // Phòng kề gộp node + chung tường → ÍT hơn 3×4=12 (trước đây trùng tường = 12).
        expect(scene.walls.length).toBeGreaterThanOrEqual(9);
        expect(scene.walls.length).toBeLessThan(12);
        expect(scene.rooms.length).toBeGreaterThanOrEqual(3);

        // Plan A: SET_ROOM_TYPE → describeScene phơi `type` để phân biệt phòng. Mọi
        // phòng phát hiện được phải có type; tập type khớp brief (living/bedroom/bathroom).
        const typed = scene.rooms.filter((r) => r.type);
        expect(typed.length).toBe(scene.rooms.length);
        expect(new Set(scene.rooms.map((r) => r.type))).toEqual(
            new Set(["living", "bedroom", "bathroom"]),
        );

        // roomKey THẬT (1b) → furnishRoom tra đúng phòng nên solver đặt được đồ (trước
        // khi fix, key 4-góc trượt → furnishRoom throw → placed=0).
        expect(out.furnished.placed).toBeGreaterThan(0);
    });
});

describe("generateHouse — guard", () => {
    it("style lạ → throw", async () => {
        const h = buildEngineHarness();
        await expect(generateHouseTool.handler({ brief: { style: "x", rooms: [{ type: "living", count: 1 }] }, confirm: true }, { api: h.api, perception: h.perception })).rejects.toThrow();
    });
    it("rooms rỗng → throw", async () => {
        const h = buildEngineHarness();
        await expect(generateHouseTool.handler({ brief: { style: "modern", rooms: [] } }, { api: h.api, perception: h.perception })).rejects.toThrow();
    });
    it("type phòng sai → throw", async () => {
        const h = buildEngineHarness();
        await expect(generateHouseTool.handler({ brief: { style: "modern", rooms: [{ type: "garage", count: 1 }] }, confirm: true }, { api: h.api, perception: h.perception })).rejects.toThrow();
    });
});
