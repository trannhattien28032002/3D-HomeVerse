import { z } from 'zod';

// Scene data: only validate that version is a number; all other fields pass through.
// Per Decision B (RQ-5 Option A), scene_data is an opaque JSONB blob — the API is not
// coupled to the evolving SceneDocument shape. It references catalog objects/materials by
// slug (Decision A); the backend never rewrites those references.
export const SceneDataSchema = z.object({ version: z.number() }).passthrough();

// Full save body: a single scene_data blob.
export const SaveSceneBodySchema = z.object({
  sceneData: SceneDataSchema,
});

export type SaveSceneBodyInput = z.infer<typeof SaveSceneBodySchema>;
