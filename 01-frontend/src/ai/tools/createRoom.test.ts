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

    it("phòng kề chung cạnh → gộp node + tái dùng tường cạnh chung", async () => {
        const h = buildEngineHarness();
        const ctx = { api: h.api, perception: h.perception };

        const a = JSON.parse(await createRoomTool.handler({ x: 0, z: 0, width: 4, depth: 4 }, ctx));
        const b = JSON.parse(await createRoomTool.handler({ x: 4, z: 0, width: 4, depth: 4 }, ctx));

        // Phòng B tái dùng 2 góc (4,0)+(4,4) của A → chỉ thêm 2 node mới (6 tổng).
        expect([...h.nodeRegistry.all()]).toHaveLength(6);
        // Cạnh chung (4,0)-(4,4) tái dùng tường của A → chỉ thêm 3 tường mới (7 tổng).
        expect(h.wallEntityByWallId.size).toBe(7);

        // 2 góc chung xuất hiện trong cả hai room, và cạnh chung trỏ cùng wallId.
        const shared = a.room.nodeIds.filter((id: string) => b.room.nodeIds.includes(id));
        expect(shared).toHaveLength(2);
        expect(b.room.wallIds.some((w: string) => a.room.wallIds.includes(w))).toBe(true);

        const rooms = RoomDetection.findRooms(h.world, h.nodeRegistry);
        expect(rooms).toHaveLength(2);
    });

    it("góc phòng rơi giữa thân tường → chẻ tường (T-junction), thấy 2 phòng", async () => {
        const h = buildEngineHarness();
        const ctx = { api: h.api, perception: h.perception };

        // A cao 6m; B kề bên phải nhưng chỉ cao 3m → góc (4,3) của B rơi GIỮA tường phải A (4,0)-(4,6).
        await createRoomTool.handler({ x: 0, z: 0, width: 4, depth: 6 }, ctx);
        await createRoomTool.handler({ x: 4, z: 0, width: 4, depth: 3 }, ctx);

        // Tường phải A bị chẻ tại (4,3) → tồn tại node ở (4,3).
        const hasMidNode = [...h.nodeRegistry.all()].some((n) => Math.abs(n.x - 4) < 1e-6 && Math.abs(n.z - 3) < 1e-6);
        expect(hasMidNode).toBe(true);

        const rooms = RoomDetection.findRooms(h.world, h.nodeRegistry);
        expect(rooms).toHaveLength(2);
    });

    it("width/depth < 0.5 → lỗi", async () => {
        const h = buildEngineHarness();
        await expect(
            createRoomTool.handler({ x: 0, z: 0, width: 0.1, depth: 3 }, { api: h.api, perception: h.perception }),
        ).rejects.toThrow();
    });
});
