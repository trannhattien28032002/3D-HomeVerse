import { z } from 'zod';

export const MaterialSearchQuerySchema = z.object({
  q: z.string().min(2).optional(),
  categoryId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CompatibleMaterialsQuerySchema = z.object({
  objectId: z.string().uuid(),
});

export type MaterialSearchQuery = z.infer<typeof MaterialSearchQuerySchema>;
