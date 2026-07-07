import { pool } from '../../shared/db/client';
import * as projectsService from '../projects/projects.service';
import * as scenesRepo from './scenes.repository';
import type { LoadSceneResponse } from './scenes.types';
import type { SaveSceneBodyInput } from './scenes.schema';

// Per Decision B, the scene is a single `scene_data` JSONB blob. Slugs inside it
// (Decision A) are stored and returned verbatim — the API never rewrites object/
// material references or resolves URLs inside the blob.

export async function loadScene(
  userId: string,
  projectId: string
): Promise<LoadSceneResponse> {
  await projectsService.assertProjectAccess(userId, projectId);

  return scenesRepo.loadScene(pool, projectId);
}

export async function saveScene(
  userId: string,
  projectId: string,
  body: SaveSceneBodyInput
): Promise<{ savedAt: string }> {
  await projectsService.assertProjectAccess(userId, projectId, {
    forbidden: 'You do not have permission to save this project',
  });

  // Single-row UPDATE — no transaction required (Decision B).
  await scenesRepo.saveSceneData(pool, projectId, body.sceneData);

  return { savedAt: new Date().toISOString() };
}
