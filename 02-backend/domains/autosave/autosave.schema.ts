import { z } from 'zod';
import { SceneDataSchema } from '../scenes/scenes.schema';

export const CreateAutosaveSchema = z.object({
  sceneData: SceneDataSchema,
  clientId: z.string().optional(),
});

// Re-export SceneDataSchema for convenience.
export { SceneDataSchema };
