/**
 * resizeRoom.test.ts — WP3. Expand → MOVE_NODES; verify area sau resize.
 */
import { describe, it, expect } from "vitest";
import { buildEngineHarness, type EngineHarness } from "src/ai/test/engineHarness";
import { createRoomTool } from "src/ai/tools/createRoom";
import { resizeRoomTool } from "src/ai/tools/resizeRoom";
import { RoomDetection } from "src/engine/graph/RoomDetection";

async function makeRoom(h: EngineHarness, x: number, z: number, w: number, d: number): Promise<string> {
    await createRoomTool.handler({ x, z, width: w, depth: d }, { api: h.api, perception: h.perception });
    const room = RoomDetection.findRooms(h.world, h.nodeRegistry)[0];
    return [...room.nodes].sort().join(",");
}

describe("resizeRoom", () => {
    it("width 4→6 → MOVE_NODES, area 12→18, vẫn 1 room", async () => {
        const h = buildEngineHarness();
        const key = await makeRoom(h, 0, 0, 4, 3);

        const raw = await resizeRoomTool.handler({ roomKey: key, width: 6 }, { api: h.api, perception: h.perception });
        const out = JSON.parse(raw);
        expect(out.ok).toBe(true);
        expect(out.room.width).toBeCloseTo(6);

        const rooms = RoomDetection.findRooms(h.world, h.nodeRegistry);
        expect(rooms).toHaveLength(1);
        expect(rooms[0].area).toBeCloseTo(18, 1);
    });

    it("roomKey không tồn tại → lỗi", async () => {
        const h = buildEngineHarness();
        await expect(
            resizeRoomTool.handler({ roomKey: "a,b,c,d", width: 5 }, { api: h.api, perception: h.perception }),
        ).rejects.toThrow();
    });

    it("thiếu cả width và depth → lỗi", async () => {
        const h = buildEngineHarness();
        const key = await makeRoom(h, 0, 0, 4, 3);
        await expect(
            resizeRoomTool.handler({ roomKey: key }, { api: h.api, perception: h.perception }),
        ).rejects.toThrow();
    });
});
