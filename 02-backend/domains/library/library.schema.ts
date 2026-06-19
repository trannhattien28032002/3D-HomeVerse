import { z } from 'zod';

// Filters use the category *slug* (Decision A) — there is no UUID category id.
export const LibrarySearchQuerySchema = z.object({
  q: z.string().min(2).optional(),
  category: z.string().optional(), // category slug, e.g. 'bathroom'
  isPremium: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type LibrarySearchQuery = z.infer<typeof LibrarySearchQuerySchema>;
