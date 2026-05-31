import type { SceneData } from '../scenes/scenes.types';

export interface Autosave {
  id: string;
  projectId: string;
  sceneData: SceneData;
  clientId: string | null;
  savedAt: Date;
}
