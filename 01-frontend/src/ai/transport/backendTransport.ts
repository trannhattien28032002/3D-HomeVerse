/**
 * BackendTransport — hiện thực LlmTransport ráp xuống backend (WP1b, 5a).
 *
 * Wire TRUNG LẬP (provider-agnostic): FE giữ `turns` (user/assistant/tool) + tool
 * schemas; mỗi turn POST cả conversation xuống /ai/chat. Backend dịch sang provider
 * (Gemini) + chuẩn hoá về { text, toolCalls, finishReason }. Đổi provider không
 * đụng file này. Key KHÔNG bao giờ vào client bundle.
 */
import type {
    LlmTransport,
    LlmTurn,
    LlmToolCall,
    LlmToolResult,
    ToolSchema,
} from "src/ai/agent/agentTypes";
import type { SceneSummary } from "src/ai/perception/describeScene";
import { formatSceneForPrompt } from "src/ai/agent/systemPrompt";

/** Lượt hội thoại trung lập (khớp NeutralTurn của backend). */
type NeutralTurn =
    | { role: "user"; text: string }
    | { role: "assistant"; text?: string; toolCalls?: LlmToolCall[] }
    | { role: "tool"; results: { id: string; name: string; content: string; isError?: boolean }[] };

/** Response chuẩn hoá từ backend (đã provider-neutral). */
type ChatResponse = { text: string; toolCalls: LlmToolCall[]; finishReason: "tool_use" | "stop" };

/**
 * Pure: ChatResponse (đã chuẩn hoá) → LlmTurn. Tách riêng để test KHÔNG cần
 * network. Có toolCalls (hoặc finishReason "tool_use") ⇒ lượt tool_use; ngược lại final.
 */
export function toTurn(resp: ChatResponse): LlmTurn {
    const text = resp.text.trim();
    if (resp.toolCalls.length > 0 || resp.finishReason === "tool_use") {
        return text ? { kind: "tool_use", calls: resp.toolCalls, text } : { kind: "tool_use", calls: resp.toolCalls };
    }
    return { kind: "final", text };
}

export type BackendTransportOpts = {
    baseUrl: string;
    system: string;
    /** Cho phép inject fetch trong test. */
    fetchImpl?: typeof fetch;
};

export class BackendTransport implements LlmTransport {
    private turns: NeutralTurn[] = [];
    private tools: ToolSchema[] = [];
    /** toolCalls của lượt assistant gần nhất — để gắn name cho tool result. */
    private lastToolCalls: LlmToolCall[] = [];
    private readonly baseUrl: string;
    private readonly system: string;
    private readonly fetchImpl: typeof fetch;

    constructor(opts: BackendTransportOpts) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this.system = opts.system;
        // Native fetch cần this === window; lưu trần rồi gọi sẽ "Illegal invocation".
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    }

    async start(input: { message: string; scene: SceneSummary; tools: ToolSchema[] }): Promise<LlmTurn> {
        this.tools = input.tools;
        this.turns = [{ role: "user", text: `${formatSceneForPrompt(input.scene)}\n\nYêu cầu: ${input.message}` }];
        return this.send();
    }

    async next(results: LlmToolResult[]): Promise<LlmTurn> {
        // Gắn name (provider cần) từ toolCalls của lượt trước, khớp theo id.
        const nameById = new Map(this.lastToolCalls.map((c) => [c.id, c.name]));
        this.turns.push({
            role: "tool",
            results: results.map((r) => ({
                id: r.id,
                name: nameById.get(r.id) ?? "",
                content: r.content,
                isError: r.isError ?? false,
            })),
        });
        return this.send();
    }

    private async send(): Promise<LlmTurn> {
        const res = await this.fetchImpl(`${this.baseUrl}/ai/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ system: this.system, tools: this.tools, turns: this.turns }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`AI backend ${res.status}: ${detail.slice(0, 300)}`);
        }
        const data = (await res.json()) as ChatResponse;
        // Lưu lượt assistant để history hợp lệ (functionCall phải có trước functionResponse).
        this.turns.push({
            role: "assistant",
            ...(data.text ? { text: data.text } : {}),
            ...(data.toolCalls.length ? { toolCalls: data.toolCalls } : {}),
        });
        this.lastToolCalls = data.toolCalls;
        return toTurn(data);
    }
}
