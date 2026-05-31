import { z } from 'zod';

export const CreateVersionSchema = z.object({
  label: z.string().max(200).optional(),
});

export type CreateVersionInput = z.infer<typeof CreateVersionSchema>;
