/**
 * addOpening.test.ts — WP3. Expand → PLACE_WALL_ITEM + guard kiểu/tường.
 */
import { describe, it, expect } from "vitest";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineApi } from "src/app/hooks/useEngineApi";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { addOpeningTool } from "src/ai/tools/addOpening";
import type { ScenePerceptionSource } from "src/ai/perception/describeScene";

function mockApi() {
    const dispatched: EngineCommand[] = [];
    const api = { dispatchAsync: async (c: EngineCommand) => { dispatched.push(c); } } as unknown as EngineApi;
    return { api, dispatched };
}

const perception: ScenePerceptionSource = {
    world: new World(),
    nodes: new NodeRegistry(),
    wallEntityByWallId: new Map([["w1", "e1"]]),
};

describe("addOpening", () => {
    it("door-a trên tường có thật → PLACE_WALL_ITEM đúng field", async () => {
        const { api, dispatched } = mockApi();
        await addOpeningTool.handler({ modelId: "door-a", hostWallId: "w1", t: 0.5 }, { api, perception });

        expect(dispatched).toHaveLength(1);
        const cmd = dispatched[0];
        expect(cmd.type).toBe("PLACE_WALL_ITEM");
        if (cmd.type === "PLACE_WALL_ITEM") {
            expect(cmd.modelId).toBe("door-a");
            expect(cmd.hostWallId).toBe("w1");
            expect(cmd.t).toBe(0.5);
            expect(cmd.side).toBe(1);
        }
    });

    it("modelId đồ SÀN (constraint floor) → reject, không dispatch", async () => {
        const { api, dispatched } = mockApi();
        await expect(
            addOpeningTool.handler({ modelId: "bed-single-01", hostWallId: "w1", t: 0.5 }, { api, perception }),
        ).rejects.toThrow();
        expect(dispatched).toHaveLength(0);
    });

    it("tường không tồn tại → reject", async () => {
        const { api } = mockApi();
        await expect(
            addOpeningTool.handler({ modelId: "door-a", hostWallId: "khong-co", t: 0.5 }, { api, perception }),
        ).rejects.toThrow();
    });

    it("t ngoài [0,1] bị clamp", async () => {
        const { api, dispatched } = mockApi();
        await addOpeningTool.handler({ modelId: "door-a", hostWallId: "w1", t: 1.7 }, { api, perception });
        const cmd = dispatched[0];
        if (cmd.type === "PLACE_WALL_ITEM") expect(cmd.t).toBe(1);
    });
});
