/**
 * dispatchBridge.test.ts — WP1a guard + executor.
 */
import { describe, it, expect } from "vitest";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineApi } from "src/app/hooks/useEngineApi";
import { assertKnownModel, dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";

describe("assertKnownModel", () => {
    it("không ném với modelId có thật", () => {
        expect(() => assertKnownModel("bed-single-01")).not.toThrow();
    });

    it("ném ToolInputError với modelId bịa", () => {
        expect(() => assertKnownModel("khong-ton-tai-xyz")).toThrow(ToolInputError);
    });
});

describe("dispatchCommands", () => {
    it("đẩy mọi command qua dispatchAsync theo đúng thứ tự", async () => {
        const got: EngineCommand[] = [];
        const api = {
            dispatchAsync: async (cmd: EngineCommand) => { got.push(cmd); },
        } as unknown as EngineApi;

        const commands: EngineCommand[] = [
            { type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 },
            { type: "ENSURE_NODE", nodeId: "n2", x: 1, z: 0 },
            { type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.15 },
        ];
        await dispatchCommands(api, commands);

        expect(got).toEqual(commands);
    });
});
