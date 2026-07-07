import { z } from 'zod';

// Filters use the category *slug* (Decision A) — there is no UUID category id.
export const MaterialSearchQuerySchema = z.object({
  q: z.string().min(2).optional(),
  category: z.string().optional(), // category slug, e.g. 'metal'
  cursor: z.string().optional(),
  // max 500: cho phép FE gom toàn bộ catalog (1 page) khi bootstrap editor.
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type MaterialSearchQuery = z.infer<typeof MaterialSearchQuerySchema>;
