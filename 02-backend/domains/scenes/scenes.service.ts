import { pool } from '../../shared/db/client';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsRepo from '../projects/projects.repository';
import * as scenesRepo from './scenes.repository';
import type { LoadSceneResponse } from './scenes.types';
import type { SaveSceneBodyInput } from './scenes.schema';
import type { ShareContext } from '../../shared/types/shareContext';

// Per Decision B, the scene is a single `scene_data` JSONB blob. Slugs inside it
// (Decision A) are stored and returned verbatim — the API never rewrites object/
// material references or resolves URLs inside the blob.

export async function loadScene(
  userId: string,
  projectId: string,
  shareContext?: ShareContext
): Promise<LoadSceneResponse> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  // Allow: owner, or any valid share (viewer, commenter, editor).
  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  return scenesRepo.loadScene(pool, projectId);
}

export async function saveScene(
  userId: string,
  projectId: string,
  body: SaveSceneBodyInput,
  shareContext?: ShareContext
): Promise<{ savedAt: string }> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  // Allow: owner, or editor share.
  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId || shareContext.permission !== 'editor') {
      throw new ForbiddenError('You do not have permission to save this project');
    }
  }

  // Single-row UPDATE — no transaction required (Decision B).
  await scenesRepo.saveSceneData(pool, projectId, body.sceneData);

  return { savedAt: new Date().toISOString() };
}
