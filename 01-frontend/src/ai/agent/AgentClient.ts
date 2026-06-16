/**
 * AgentClient — vòng lặp tool-use phía FE (WP1).
 *
 * Điều phối: start hội thoại qua transport → với mỗi lượt tool_use, chạy các
 * tool qua registry (expand → dispatch) → nộp kết quả lại transport → lặp đến
 * khi LLM kết thúc hoặc chạm trần số bước.
 *
 * Undo-safety: bọc TOÀN BỘ lượt trong 1 asyncTransaction → undo 1 phát xoá sạch
 * mọi thay đổi AI tạo ra trong lượt (kể cả nhiều tool-call). asyncTransaction là
 * đường undo-safe cho PLACE_FURNITURE/PLACE_WALL_ITEM (snapshot trước → await →
 * push history sau).
 *
 * transport là seam: 5a round-trip xuống backend (key server-side); test giả lập.
 */
import type { LlmTransport, ToolContext, AgentRunResult, LlmToolResult } from "src/ai/agent/agentTypes";
import type { ToolRegistry } from "src/ai/agent/toolRegistry";
import type { SceneSummary } from "src/ai/perception/describeScene";

/** Trần số vòng tool-use — chống loop không hội tụ (cross-cutting guardrail). */
const DEFAULT_MAX_STEPS = 8;

export type RunAgentInput = {
    message: string;
    scene: SceneSummary;
    /** Nhãn transaction (mặc định cắt từ message). */
    label?: string;
    maxSteps?: number;
};

export async function runAgent(
    transport: LlmTransport,
    registry: ToolRegistry,
    ctx: ToolContext,
    input: RunAgentInput,
): Promise<AgentRunResult> {
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    const label = `ai: ${input.label ?? input.message.slice(0, 40)}`;

    const result: AgentRunResult = {
        finalText: "",
        steps: 0,
        toolCalls: [],
        stoppedReason: "final",
    };

    await ctx.api.asyncTransaction(label, async () => {
        let turn = await transport.start({
            message: input.message,
            scene: input.scene,
            tools: registry.schemas(),
        });

        while (turn.kind === "tool_use") {
            if (result.steps >= maxSteps) {
                result.stoppedReason = "max_steps";
                result.finalText = turn.text ?? "(đạt giới hạn số bước AI)";
                return;
            }
            result.steps++;

            const results: LlmToolResult[] = [];
            for (const call of turn.calls) {
                const r = await registry.execute(call, ctx);
                result.toolCalls.push({ name: call.name, ok: !r.isError });
                results.push(r);
            }
            turn = await transport.next(results);
        }

        result.finalText = turn.text;
    });

    return result;
}
