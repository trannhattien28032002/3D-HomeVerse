/**
 * AgentClient.test.ts — WP1a: chứng minh trục dispatch headless.
 *
 * Giả lập EngineApi (ghi lại command + transaction) và LlmTransport (script tool-
 * call), KHÔNG cần engine/GLB thật. Verify: tool-call placeFurniture → đúng
 * PLACE_FURNITURE xuống dispatchAsync, gói trong ĐÚNG 1 asyncTransaction (→ undo
 * 1 phát), guard chống hallucinate, và trần số bước.
 */
import { describe, it, expect } from "vitest";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineApiFacade } from "src/engine/engineTypes";
import type { LlmTransport, LlmTurn } from "src/ai/agent/agentTypes";
import type { SceneSummary } from "src/ai/perception/describeScene";
import { ToolRegistry } from "src/ai/agent/toolRegistry";
import { placeFurnitureTool } from "src/ai/tools/placeFurniture";
import { runAgent } from "src/ai/agent/AgentClient";

const REAL_MODEL = "bed-single-01"; // id có thật trong objects.json

// ── Mock EngineApi ──────────────────────────────────────────────────────────────
type MockApi = EngineApiFacade & {
    dispatched: EngineCommand[];
    txLabels: string[];
    txDepthMax: number;
};

function mockApi(): MockApi {
    const dispatched: EngineCommand[] = [];
    const txLabels: string[] = [];
    let txDepth = 0;
    let txDepthMax = 0;

    const api: Partial<MockApi> = {
        dispatched,
        txLabels,
        get txDepthMax() {
            return txDepthMax;
        },
        async asyncTransaction(label: string, fn: () => Promise<void>) {
            txLabels.push(label);
            txDepth++;
            txDepthMax = Math.max(txDepthMax, txDepth);
            try {
                await fn();
            } finally {
                txDepth--;
            }
        },
        async dispatchAsync(cmd: EngineCommand) {
            dispatched.push(cmd);
        },
    };
    return api as MockApi;
}

// ── Scripted transport ──────────────────────────────────────────────────────────
/** Phát lần lượt các lượt đã định sẵn; bỏ qua nội dung tool_result. */
function scriptedTransport(turns: LlmTurn[]): LlmTransport {
    let i = 0;
    const nextTurn = (): LlmTurn => turns[Math.min(i++, turns.length - 1)];
    return {
        start: async () => nextTurn(),
        next: async () => nextTurn(),
    };
}

const EMPTY_SCENE: SceneSummary = { rooms: [], walls: [], furniture: [], wallItems: [], empty: true };

describe("runAgent — WP1a dispatch axis", () => {
    it("placeFurniture tool-call → dispatch PLACE_FURNITURE, gói trong 1 asyncTransaction", async () => {
        const api = mockApi();
        const registry = new ToolRegistry([placeFurnitureTool]);
        const transport = scriptedTransport([
            {
                kind: "tool_use",
                calls: [{ id: "t1", name: "placeFurniture", input: { modelId: REAL_MODEL, x: 2, z: 1.5, rotY: 0 } }],
            },
            { kind: "final", text: "Đã đặt giường giữa phòng." },
        ]);

        const res = await runAgent(transport, registry, { api }, { message: "đặt giường giữa phòng", scene: EMPTY_SCENE });

        // Đúng 1 command PLACE_FURNITURE với toạ độ LLM chọn.
        expect(api.dispatched).toHaveLength(1);
        const cmd = api.dispatched[0];
        expect(cmd.type).toBe("PLACE_FURNITURE");
        if (cmd.type === "PLACE_FURNITURE") {
            expect(cmd.modelId).toBe(REAL_MODEL);
            expect(cmd.x).toBe(2);
            expect(cmd.z).toBe(1.5);
            expect(cmd.rotY).toBe(0);
        }

        // Đúng 1 transaction bao quanh (→ undo 1 phát), nhãn "ai: ..."
        expect(api.txLabels).toHaveLength(1);
        expect(api.txLabels[0]).toMatch(/^ai:/);
        expect(api.txDepthMax).toBe(1);

        expect(res.steps).toBe(1);
        expect(res.toolCalls).toEqual([{ name: "placeFurniture", ok: true }]);
        expect(res.stoppedReason).toBe("final");
        expect(res.finalText).toBe("Đã đặt giường giữa phòng.");
    });

    it("guard chống hallucinate: modelId bịa → tool_result lỗi, KHÔNG dispatch", async () => {
        const api = mockApi();
        const registry = new ToolRegistry([placeFurnitureTool]);
        const transport = scriptedTransport([
            {
                kind: "tool_use",
                calls: [{ id: "t1", name: "placeFurniture", input: { modelId: "ghe-bay-mau", x: 0, z: 0 } }],
            },
            { kind: "final", text: "Xin lỗi, model không tồn tại." },
        ]);

        const res = await runAgent(transport, registry, { api }, { message: "đặt ghế bay màu", scene: EMPTY_SCENE });

        expect(api.dispatched).toHaveLength(0); // bị guard chặn trước dispatcher
        expect(res.toolCalls).toEqual([{ name: "placeFurniture", ok: false }]);
        expect(res.stoppedReason).toBe("final");
    });

    it("trần số bước: transport luôn đòi tool → dừng ở max_steps", async () => {
        const api = mockApi();
        const registry = new ToolRegistry([placeFurnitureTool]);
        // Luôn trả tool_use → không bao giờ final.
        const transport = scriptedTransport([
            {
                kind: "tool_use",
                calls: [{ id: "t", name: "placeFurniture", input: { modelId: REAL_MODEL, x: 0, z: 0 } }],
            },
        ]);

        const res = await runAgent(transport, registry, { api }, {
            message: "loop",
            scene: EMPTY_SCENE,
            maxSteps: 3,
        });

        expect(res.stoppedReason).toBe("max_steps");
        expect(res.steps).toBe(3);
        expect(api.dispatched).toHaveLength(3); // 3 lượt đã chạy trước khi chạm trần
        expect(api.txLabels).toHaveLength(1);    // vẫn chỉ 1 transaction
    });

    it("tool không tồn tại → tool_result lỗi, không vỡ vòng lặp", async () => {
        const api = mockApi();
        const registry = new ToolRegistry([placeFurnitureTool]);
        const transport = scriptedTransport([
            { kind: "tool_use", calls: [{ id: "t1", name: "khongCoTool", input: {} }] },
            { kind: "final", text: "ok" },
        ]);

        const res = await runAgent(transport, registry, { api }, { message: "x", scene: EMPTY_SCENE });
        expect(res.toolCalls).toEqual([{ name: "khongCoTool", ok: false }]);
        expect(api.dispatched).toHaveLength(0);
    });

    it("registry.schemas() trả schema Anthropic-compatible cho placeFurniture", () => {
        const registry = new ToolRegistry([placeFurnitureTool]);
        const schemas = registry.schemas();
        expect(schemas).toHaveLength(1);
        expect(schemas[0].name).toBe("placeFurniture");
        expect(schemas[0].input_schema.type).toBe("object");
        expect(schemas[0].input_schema.required).toEqual(["modelId", "x", "z"]);
    });
});
