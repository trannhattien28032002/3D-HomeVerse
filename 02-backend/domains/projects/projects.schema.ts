import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().max(200).optional(),
  floorCount: z.number().int().min(1).max(10).optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().max(200).optional(),
  thumbnailUrl: z.string().url().optional(),
  isTemplate: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const ListProjectsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['updatedAt', 'createdAt', 'name']).default('updatedAt'),
});
