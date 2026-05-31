import { z } from 'zod';

// Scene data: only validate that version is a number; all other fields pass through.
export const SceneDataSchema = z.object({ version: z.number() }).passthrough();

// A placed instance. id is optional (generated server-side when absent).
export const ProjectObjectSchema = z.object({
  id: z.string().uuid().optional(),
  libraryObjectId: z.string().uuid(),
  transform: z.record(z.string(), z.unknown()).default({}),
  floorIndex: z.number().int().default(0),
  materialSlots: z.record(z.string(), z.unknown()).default({}),
  instanceProps: z.record(z.string(), z.unknown()).default({}),
});

// Full save body: scene data + objects array.
export const SaveSceneBodySchema = z.object({
  sceneData: SceneDataSchema,
  objects: z.array(ProjectObjectSchema),
});

export type SaveSceneBodyInput = z.infer<typeof SaveSceneBodySchema>;
export type ProjectObjectInput = z.infer<typeof ProjectObjectSchema>;
