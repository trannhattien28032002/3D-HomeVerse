import { z } from 'zod';

export const CreateShareSchema = z.object({
  sharedWith: z.string().uuid().optional(),
  permission: z.enum(['viewer', 'commenter', 'editor']),
  expiresAt: z.string().datetime().optional(),
});

export const UpdateShareSchema = z.object({
  permission: z.enum(['viewer', 'commenter', 'editor']).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateShareInput = z.infer<typeof CreateShareSchema>;
export type UpdateShareInput = z.infer<typeof UpdateShareSchema>;
