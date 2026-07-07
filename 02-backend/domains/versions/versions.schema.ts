import { z } from 'zod';

export const CreateVersionSchema = z.object({
  label: z.string().max(200).optional(),
});
