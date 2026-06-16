import { pool } from '../../shared/db/client';
import { withTransaction } from '../../shared/db/transaction';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsRepo from '../projects/projects.repository';
import * as repo from './autosave.repository';
import type { Autosave } from './autosave.types';
import type { SceneData } from '../scenes/scenes.types';
import type { ShareContext } from '../../shared/types/shareContext';

export async function createAutosave(
  userId: string,
  projectId: string,
  body: { sceneData: SceneData; clientId?: string },
  shareContext?: ShareContext
): Promise<{ id: string; savedAt: Date }> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  // Allow: owner, or editor share.
  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId || shareContext.permission !== 'editor') {
      throw new ForbiddenError('You do not have permission to autosave this project');
    }
  }

  const autosave = await withTransaction(pool, async (client) => {
    const saved = await repo.insertAutosave(client, projectId, body.sceneData, body.clientId);
    await repo.pruneAutosaves(client, projectId, 5);
    return saved;
  });

  return { id: autosave.id, savedAt: autosave.savedAt };
}

export async function getLatest(
  userId: string,
  projectId: string,
  shareContext?: ShareContext
): Promise<Autosave> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  // Allow: owner, or editor share.
  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId || shareContext.permission !== 'editor') {
      throw new ForbiddenError('You do not have permission to access autosaves for this project');
    }
  }

  const autosave = await repo.getLatestAutosave(pool, projectId);
  if (!autosave) throw new NotFoundError('No autosave found for this project');
  return autosave;
}
