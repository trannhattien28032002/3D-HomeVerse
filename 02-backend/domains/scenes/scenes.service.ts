import { pool } from '../../shared/db/client';
import { withTransaction } from '../../shared/db/transaction';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { resolvePublicUrl } from '../../shared/storage/storageClient';
import * as projectsRepo from '../projects/projects.repository';
import * as scenesRepo from './scenes.repository';
import type { LoadSceneResponse, ProjectObject } from './scenes.types';
import type { SaveSceneBodyInput } from './scenes.schema';
import type { ShareContext } from '../../shared/types/shareContext';

function resolveObjectUrls(obj: ProjectObject): ProjectObject {
  // library_objects.model_url is a storage-relative path; resolve to CDN URL.
  // modelUrl is not stored in project_objects — caller will need to join with library_objects.
  // For now, modelUrl is populated by the library service on join. Here we return obj as-is.
  // TODO: join with library_objects to attach modelUrl when loading scene.
  return obj;
}

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

  const { sceneData, objects } = await scenesRepo.loadScene(pool, projectId);

  // Resolve model URLs for each object.
  // NOTE: a full join with library_objects to get model_url would be ideal;
  // for v1, modelUrl is omitted here and resolved at the client/library layer.
  const resolvedObjects = objects.map(resolveObjectUrls);

  return { sceneData, objects: resolvedObjects };
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

  const incomingIds = body.objects
    .filter((o) => !!o.id)
    .map((o) => o.id as string);

  await withTransaction(pool, async (client) => {
    await scenesRepo.saveSceneData(client, projectId, body.sceneData);
    await scenesRepo.bulkUpsertObjects(client, projectId, body.objects);
    await scenesRepo.deleteRemovedObjects(client, projectId, incomingIds);
  });

  return { savedAt: new Date().toISOString() };
}
