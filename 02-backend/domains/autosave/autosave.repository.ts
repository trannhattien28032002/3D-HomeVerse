import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { Autosave } from './autosave.types';
import type { SceneData } from '../scenes/scenes.types';

type Client = Pool | PoolClient;

export async function insertAutosave(
  client: Client,
  projectId: string,
  sceneData: SceneData,
  clientId?: string
): Promise<Autosave> {
  const { rows } = await typedQuery<Autosave>(
    client,
    `INSERT INTO public.project_autosaves (project_id, scene_data, client_id)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, scene_data, client_id, saved_at`,
    [projectId, JSON.stringify(sceneData), clientId ?? null]
  );
  return rows[0];
}

// Prune autosaves to keep only the last `keepLast` rows per project.
// Uses ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY saved_at DESC) pattern.
export async function pruneAutosaves(
  client: Client,
  projectId: string,
  keepLast = 5
): Promise<void> {
  await client.query(
    `DELETE FROM public.project_autosaves
     WHERE id IN (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY project_id
                  ORDER BY saved_at DESC
                ) AS rn
         FROM public.project_autosaves
         WHERE project_id = $1
       ) ranked
       WHERE rn > $2
     )`,
    [projectId, keepLast]
  );
}

export async function getLatestAutosave(
  client: Client,
  projectId: string
): Promise<Autosave | null> {
  const { rows } = await typedQuery<Autosave>(
    client,
    `SELECT id, project_id, scene_data, client_id, saved_at
     FROM public.project_autosaves
     WHERE project_id = $1
     ORDER BY saved_at DESC
     LIMIT 1`,
    [projectId]
  );
  return rows[0] ?? null;
}
