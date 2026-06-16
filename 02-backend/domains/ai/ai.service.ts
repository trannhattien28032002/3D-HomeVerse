/**
 * ai.service — gọi Google Gemini (WP1b).
 *
 * Model mặc định gemini-2.5-flash (đổi sang Pro qua env GEMINI_MODEL). Dịch wire
 * trung lập (turns) → Gemini `contents` (role user/model, parts text/functionCall/
 * functionResponse), gọi generateContent, rồi chuẩn hoá về { text, toolCalls,
 * finishReason }. Tool schema truyền qua `parametersJsonSchema` (raw JSON Schema)
 * nên không phải convert sang Type enum của Gemini.
 */
import { GoogleGenAI } from '@google/genai';
import type { Content, FunctionDeclaration } from '@google/genai';
import { env } from '../../configs/env';
import { AppError } from '../../shared/errors/AppError';
import type { ChatBody } from './ai.schema';
import type { ChatResponse, NeutralTurn } from './ai.types';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_TOKENS = 8192;

// Retry cho lỗi tạm thời của Gemini (quá tải / rate-limit / server). SDK không tự retry.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown }).status;
  return typeof s === 'number' ? s : undefined;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(
      'AI chưa được cấu hình: thiếu GEMINI_API_KEY trên server.',
      503,
      'AI_NOT_CONFIGURED'
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

/** Bọc content tool thành object response cho Gemini (quy ước output/error). */
function toResponseObject(content: string, isError?: boolean): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }
  return isError ? { error: parsed } : { output: parsed };
}

/** Dịch turns trung lập → Gemini contents. */
function toContents(turns: NeutralTurn[]): Content[] {
  const out: Content[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      out.push({ role: 'user', parts: [{ text: turn.text }] });
    } else if (turn.role === 'assistant') {
      const parts: Content['parts'] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const c of turn.toolCalls ?? []) {
        parts.push({
          functionCall: { id: c.id, name: c.name, args: (c.input ?? {}) as Record<string, unknown> },
        });
      }
      out.push({ role: 'model', parts });
    } else {
      // tool results → functionResponse parts (role 'user' theo chuẩn Gemini).
      out.push({
        role: 'user',
        parts: turn.results.map((r) => ({
          functionResponse: { id: r.id, name: r.name, response: toResponseObject(r.content, r.isError) },
        })),
      });
    }
  }
  return out;
}

export async function runChat(body: ChatBody): Promise<ChatResponse> {
  const ai = getClient();
  const model = env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const functionDeclarations: FunctionDeclaration[] | undefined = body.tools?.length
    ? body.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.input_schema,
      }))
    : undefined;

  const params = {
    model,
    contents: toContents(body.turns),
    config: {
      ...(body.system ? { systemInstruction: body.system } : {}),
      ...(functionDeclarations ? { tools: [{ functionDeclarations }] } : {}),
      maxOutputTokens: body.maxTokens ?? DEFAULT_MAX_TOKENS,
    },
  };

  try {
    let resp;
    for (let attempt = 0; ; attempt++) {
      try {
        resp = await ai.models.generateContent(params);
        break;
      } catch (err) {
        const status = statusOf(err);
        if (attempt >= MAX_RETRIES || status === undefined || !RETRYABLE_STATUS.has(status)) throw err;
        // Exponential backoff + jitter: ~0.4s, 0.8s, 1.6s.
        await sleep(400 * 2 ** attempt + Math.random() * 200);
      }
    }

    const calls = (resp.functionCalls ?? []).map((fc, i) => ({
      id: fc.id ?? `call_${i}`,
      name: fc.name ?? '',
      input: fc.args ?? {},
    }));

    return {
      text: resp.text ?? '',
      toolCalls: calls,
      finishReason: calls.length > 0 ? 'tool_use' : 'stop',
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const status =
      typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 502;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(`Gemini API lỗi: ${message}`, status, 'AI_UPSTREAM_ERROR');
  }
}
