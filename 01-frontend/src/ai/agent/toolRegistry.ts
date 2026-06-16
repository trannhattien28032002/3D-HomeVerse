/**
 * toolRegistry — đăng ký tool schema + handler, và route tool-call → handler.
 *
 * Lỗi handler (kể cả ToolInputError do guard) KHÔNG ném vỡ vòng lặp: registry
 * gói thành tool_result `{ ok:false, error }` để LLM thấy và tự sửa ở lượt sau
 * (đúng tinh thần "agent thấy kết quả thật → tự sửa").
 */
import type {
    ToolDef,
    ToolSchema,
    ToolContext,
    LlmToolCall,
    LlmToolResult,
} from "src/ai/agent/agentTypes";

export class ToolRegistry {
    private tools = new Map<string, ToolDef>();

    constructor(defs: ToolDef[]) {
        for (const d of defs) this.tools.set(d.schema.name, d);
    }

    /** Schemas để gửi cho LLM (Anthropic `tools`). */
    schemas(): ToolSchema[] {
        return [...this.tools.values()].map((d) => d.schema);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    /** Chạy 1 tool-call, luôn trả LlmToolResult (lỗi → isError + thông điệp). */
    async execute(call: LlmToolCall, ctx: ToolContext): Promise<LlmToolResult> {
        const tool = this.tools.get(call.name);
        if (!tool) {
            return {
                id: call.id,
                content: JSON.stringify({ ok: false, error: `Tool không tồn tại: ${call.name}` }),
                isError: true,
            };
        }
        try {
            const content = await tool.handler(call.input, ctx);
            return { id: call.id, content };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                id: call.id,
                content: JSON.stringify({ ok: false, error: message }),
                isError: true,
            };
        }
    }
}
