import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { SceneData, ProjectObject } from './scenes.types';
import type { ProjectObjectInput } from './scenes.schema';

type Client = Pool | PoolClient;

const OBJ_COLS = `
  id, project_id, library_object_id, transform, floor_index,
  material_slots, instance_props, created_at, updated_at
`;

export async function loadScene(
  client: Client,
  projectId: string
): Promise<{ sceneData: SceneData; objects: ProjectObject[] }> {
  const [projectResult, objectsResult] = await Promise.all([
    typedQuery<{ sceneData: SceneData }>(
      client,
      'SELECT scene_data FROM public.projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    ),
    typedQuery<ProjectObject>(
      client,
      `SELECT ${OBJ_COLS} FROM public.project_objects WHERE project_id = $1 ORDER BY created_at`,
      [projectId]
    ),
  ]);

  const sceneData = projectResult.rows[0]?.sceneData ?? ({ version: 1 } as SceneData);
  return { sceneData, objects: objectsResult.rows };
}

export async function saveSceneData(
  client: Client,
  projectId: string,
  sceneData: SceneData
): Promise<void> {
  await client.query(
    'UPDATE public.projects SET scene_data = $1 WHERE id = $2',
    [JSON.stringify(sceneData), projectId]
  );
}

export async function bulkUpsertObjects(
  client: Client,
  projectId: string,
  objects: ProjectObjectInput[]
): Promise<void> {
  if (objects.length === 0) return;

  // Build a multi-row VALUES clause using unnest with typed arrays.
  // Each object gets a server-generated UUID when no id is provided.
  const ids: string[] = objects.map((o) => o.id ?? crypto.randomUUID());
  const libraryObjectIds = objects.map((o) => o.libraryObjectId);
  const transforms = objects.map((o) => JSON.stringify(o.transform));
  const floorIndexes = objects.map((o) => o.floorIndex);
  const materialSlots = objects.map((o) => JSON.stringify(o.materialSlots));
  const instanceProps = objects.map((o) => JSON.stringify(o.instanceProps));

  await client.query(
    `INSERT INTO public.project_objects
       (id, project_id, library_object_id, transform, floor_index, material_slots, instance_props)
     SELECT
       unnest($1::uuid[]),
       $2::uuid,
       unnest($3::uuid[]),
       unnest($4::jsonb[]),
       unnest($5::smallint[]),
       unnest($6::jsonb[]),
       unnest($7::jsonb[])
     ON CONFLICT (id) DO UPDATE SET
       library_object_id = EXCLUDED.library_object_id,
       transform         = EXCLUDED.transform,
       floor_index       = EXCLUDED.floor_index,
       material_slots    = EXCLUDED.material_slots,
       instance_props    = EXCLUDED.instance_props,
       updated_at        = NOW()`,
    [ids, projectId, libraryObjectIds, transforms, floorIndexes, materialSlots, instanceProps]
  );
}

export async function deleteRemovedObjects(
  client: Client,
  projectId: string,
  incomingIds: string[]
): Promise<void> {
  if (incomingIds.length === 0) {
    // Delete all objects for this project (saving with empty objects list).
    await client.query(
      'DELETE FROM public.project_objects WHERE project_id = $1',
      [projectId]
    );
  } else {
    await client.query(
      'DELETE FROM public.project_objects WHERE project_id = $1 AND id <> ALL($2::uuid[])',
      [projectId, incomingIds]
    );
  }
}

export async function copyProjectObjects(
  client: Client,
  sourceProjectId: string,
  targetProjectId: string
): Promise<void> {
  await client.query(
    `INSERT INTO public.project_objects
       (project_id, library_object_id, transform, floor_index, material_slots, instance_props)
     SELECT
       $2::uuid,
       library_object_id,
       transform,
       floor_index,
       material_slots,
       instance_props
     FROM public.project_objects
     WHERE project_id = $1`,
    [sourceProjectId, targetProjectId]
  );
}
