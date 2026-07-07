import { pool } from '../../shared/db/client';
import { withTransaction } from '../../shared/db/transaction';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsService from '../projects/projects.service';
import * as repo from './autosave.repository';
import type { Autosave } from './autosave.types';
import type { SceneData } from '../scenes/scenes.types';

export async function createAutosave(
  userId: string,
  projectId: string,
  body: { sceneData: SceneData; clientId?: string }
): Promise<{ id: string; savedAt: Date }> {
  await projectsService.assertProjectAccess(userId, projectId, {
    forbidden: 'You do not have permission to autosave this project',
  });

  const autosave = await withTransaction(pool, async (client) => {
    const saved = await repo.insertAutosave(client, projectId, body.sceneData, body.clientId);
    await repo.pruneAutosaves(client, projectId, 5);
    return saved;
  });

  return { id: autosave.id, savedAt: autosave.savedAt };
}

export async function getLatest(
  userId: string,
  projectId: string
): Promise<Autosave> {
  await projectsService.assertProjectAccess(userId, projectId, {
    forbidden: 'You do not have permission to access autosaves for this project',
  });

  const autosave = await repo.getLatestAutosave(pool, projectId);
  if (!autosave) throw new NotFoundError('No autosave found for this project');
  return autosave;
}
