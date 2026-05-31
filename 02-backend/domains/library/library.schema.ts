import { z } from 'zod';

export const LibrarySearchQuerySchema = z.object({
  q: z.string().min(2).optional(),
  categoryId: z.string().uuid().optional(),
  placement: z.enum(['floor', 'wall', 'ceiling', 'wall_floor', 'any']).optional(),
  tags: z.string().optional(), // CSV — split to array in service
  isPremium: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type LibrarySearchQuery = z.infer<typeof LibrarySearchQuerySchema>;
