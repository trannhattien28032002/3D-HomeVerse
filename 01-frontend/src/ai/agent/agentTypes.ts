/**
 * agentTypes — type seam giữa agent loop (FE) và nơi LLM thực sự sống.
 *
 * Quyết định kiến trúc 5a: vòng lặp tool-use + API key (Gemini) nằm ở 02-backend.
 * FE chỉ điều phối: nhận tool-call → expand thành EngineCommand[] → dispatch.
 * `LlmTransport` là chỗ ráp backend — ở WP1a ta giả lập nó để test headless;
 * ở WP1b nó round-trip thật xuống backend (key không bao giờ vào client bundle).
 * Provider bị cô lập hoàn toàn trong backend nhờ wire trung lập → đổi provider
 * (Anthropic↔Gemini↔...) không đụng FE.
 */
import type { SceneSummary, ScenePerceptionSource } from "src/ai/perception/describeScene";
import type { EngineApiFacade } from "src/engine/engineTypes";

/** JSON-schema mô tả 1 tool (provider-neutral; backend map sang định dạng provider). */
export type ToolSchema = {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
};

/** Một lần LLM yêu cầu gọi tool (id để ghép tool_result tương ứng). */
export type LlmToolCall = { id: string; name: string; input: unknown };

/** Kết quả của 1 tool trả lại cho LLM (content là JSON string để model đọc). */
export type LlmToolResult = { id: string; content: string; isError?: boolean };

/** Một "lượt" phát ra từ phía LLM: hoặc đòi gọi tool, hoặc kết thúc. */
export type LlmTurn =
    | { kind: "tool_use"; calls: LlmToolCall[]; text?: string }
    | { kind: "final"; text: string };

/**
 * Seam giữa agent loop và LLM. Stateful trong 1 lần chạy:
 *   start() — mở hội thoại (message + scene perception + tool schemas) → lượt đầu.
 *   next()  — nộp kết quả tool đã chạy → lượt kế tiếp.
 * Backend (5a) hiện thực bằng 1 session giữ message history; test bằng script.
 */
export interface LlmTransport {
    start(input: { message: string; scene: SceneSummary; tools: ToolSchema[] }): Promise<LlmTurn>;
    next(results: LlmToolResult[]): Promise<LlmTurn>;
}

/** Context cấp cho tool handler khi execute. */
export type ToolContext = {
    /** Facade dispatch (null-safe) — đường DUY NHẤT đổi scene. */
    api: EngineApiFacade;
    /** Nguồn re-perceive sau khi đổi scene. Optional ở WP1a. */
    perception?: ScenePerceptionSource;
};

export type ToolHandler = (input: unknown, ctx: ToolContext) => Promise<string>;

/** Một tool: schema (để LLM biết) + handler (expand → dispatch). */
export type ToolDef = {
    schema: ToolSchema;
    handler: ToolHandler;
};

export type AgentRunResult = {
    /** Văn bản cuối cùng agent trả về người dùng. */
    finalText: string;
    /** Số vòng tool-use đã chạy. */
    steps: number;
    /** Tóm tắt mỗi tool-call để telemetry/debug. */
    toolCalls: { name: string; ok: boolean }[];
    /** Lý do dừng: LLM kết thúc bình thường, hay chạm trần số bước. */
    stoppedReason: "final" | "max_steps";
};
