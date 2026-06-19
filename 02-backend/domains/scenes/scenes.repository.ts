import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { SceneData } from './scenes.types';

type Client = Pool | PoolClient;

// Per Decision B, a scene is the single `projects.scene_data` JSONB column.
// Load is a single-row SELECT; save is a single-row UPDATE. There is no
// `project_objects` registry, bulk upsert, delete-removed, or copy leg.

export async function loadScene(
  client: Client,
  projectId: string
): Promise<{ sceneData: SceneData }> {
  const { rows } = await typedQuery<{ sceneData: SceneData }>(
    client,
    'SELECT scene_data FROM public.projects WHERE id = $1 AND deleted_at IS NULL',
    [projectId]
  );

  const sceneData = rows[0]?.sceneData ?? ({ version: 1 } as SceneData);
  return { sceneData };
}

export async function saveSceneData(
  client: Client,
  projectId: string,
  sceneData: SceneData
): Promise<void> {
  await client.query(
    'UPDATE public.projects SET scene_data = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(sceneData), projectId]
  );
}
