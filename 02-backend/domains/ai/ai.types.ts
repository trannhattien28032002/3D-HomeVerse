/**
 * Types cho domain AI — proxy tới Gemini (WP1b, provider = Google Gemini).
 *
 * Wire format FE↔BE là TRUNG LẬP (không lệ thuộc provider): FE gửi `turns`
 * (user/assistant/tool) + tool schemas; backend dịch sang định dạng Gemini,
 * gọi API, rồi chuẩn hoá kết quả về `{ text, toolCalls, finishReason }`. Nhờ vậy
 * đổi provider chỉ sửa ai.service, FE không đổi. Bất biến: GEMINI_API_KEY chỉ ở server.
 */

/** Một tool schema (JSON Schema cho tham số). */
export type ToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Một lần model đòi gọi tool. */
export type AgentToolCall = { id: string; name: string; input: unknown };

/** Một lượt hội thoại trung lập. */
export type NeutralTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: AgentToolCall[] }
  | {
      role: 'tool';
      results: { id: string; name: string; content: string; isError?: boolean }[];
    };

/** Body của POST /ai/chat. */
export type ChatRequest = {
  system?: string;
  tools?: ToolSchema[];
  turns: NeutralTurn[];
  maxTokens?: number;
};

/** Response chuẩn hoá của POST /ai/chat. */
export type ChatResponse = {
  text: string;
  toolCalls: AgentToolCall[];
  finishReason: 'tool_use' | 'stop';
};
