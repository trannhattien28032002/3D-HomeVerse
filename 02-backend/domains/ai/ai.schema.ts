/**
 * Zod schema cho POST /ai/chat (wire trung lập — provider-agnostic).
 *
 * Validate shape thô của turns + tools; input của tool-call là `unknown` (model
 * sinh tự do, tool handler phía FE tự parse). Pass-through cho ai.service dịch sang
 * Gemini.
 */
import { z } from 'zod';

const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

const UserTurn = z.object({
  role: z.literal('user'),
  text: z.string(),
});

const AssistantTurn = z.object({
  role: z.literal('assistant'),
  text: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
});

const ToolResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});

const ToolTurn = z.object({
  role: z.literal('tool'),
  results: z.array(ToolResultSchema),
});

const TurnSchema = z.discriminatedUnion('role', [UserTurn, AssistantTurn, ToolTurn]);

const ToolDeclSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
});

export const ChatBodySchema = z.object({
  system: z.string().max(20000).optional(),
  tools: z.array(ToolDeclSchema).max(64).optional(),
  turns: z.array(TurnSchema).min(1).max(100),
  maxTokens: z.number().int().min(1).max(16000).optional(),
});

export type ChatBody = z.infer<typeof ChatBodySchema>;
