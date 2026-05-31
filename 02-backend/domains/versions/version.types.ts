import type { SceneData } from '../scenes/scenes.types';

// Full version row including scene_data snapshot.
export interface Version {
  id: string;
  projectId: string;
  versionNum: number;
  label: string | null;
  sceneData: SceneData;
  createdBy: string | null;
  createdAt: Date;
}

// Version summary (no scene_data — used in list endpoint).
export interface VersionSummary {
  id: string;
  projectId: string;
  versionNum: number;
  label: string | null;
  createdBy: string | null;
  createdAt: Date;
}
