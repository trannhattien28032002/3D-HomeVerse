/**
 * createRoom.test.ts — WP3. Done-when: tạo phòng kín, RoomDetection thấy 1 room.
 */
import { describe, it, expect } from "vitest";
import { buildEngineHarness } from "src/ai/test/engineHarness";
import { createRoomTool } from "src/ai/tools/createRoom";
import { RoomDetection } from "src/engine/graph/RoomDetection";

describe("createRoom", () => {
    it("tạo phòng 4×3 kín → 1 room, area ≈ 12, 4 node + 4 wall", async () => {
        const h = buildEngineHarness();
        const raw = await createRoomTool.handler({ x: 0, z: 0, width: 4, depth: 3 }, { api: h.api, perception: h.perception });
        const out = JSON.parse(raw);

        expect(out.ok).toBe(true);
        expect(out.room.nodeIds).toHaveLength(4);
        expect(out.room.wallIds).toHaveLength(4);
        expect(h.wallEntityByWallId.size).toBe(4);

        const rooms = RoomDetection.findRooms(h.world, h.nodeRegistry);
        expect(rooms).toHaveLength(1);
        expect(rooms[0].area).toBeCloseTo(12, 1);
    });

    it("width/depth < 0.5 → lỗi", async () => {
        const h = buildEngineHarness();
        await expect(
            createRoomTool.handler({ x: 0, z: 0, width: 0.1, depth: 3 }, { api: h.api, perception: h.perception }),
        ).rejects.toThrow();
    });
});
