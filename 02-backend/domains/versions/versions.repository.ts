import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import type { Version, VersionSummary } from './version.types';

type Client = Pool | PoolClient;

const SUMMARY_COLS = `
  id, project_id, version_num, label, created_by, created_at
`;

const FULL_COLS = `
  id, project_id, version_num, label, scene_data, created_by, created_at
`;

export async function createVersion(
  client: Client,
  projectId: string,
  label: string | undefined,
  userId: string
): Promise<VersionSummary> {
  // Snapshot current projects.scene_data and assign next version_num atomically.
  const { rows } = await typedQuery<VersionSummary>(
    client,
    `INSERT INTO public.project_versions (project_id, version_num, label, scene_data, created_by)
     SELECT
       $1,
       next_project_version($1),
       $2,
       p.scene_data,
       $3
     FROM public.projects p
     WHERE p.id = $1 AND p.deleted_at IS NULL
     RETURNING ${SUMMARY_COLS}`,
    [projectId, label ?? null, userId]
  );
  if (!rows[0]) throw new NotFoundError('Project not found');
  return rows[0];
}

export async function listVersions(
  client: Client,
  projectId: string
): Promise<VersionSummary[]> {
  const { rows } = await typedQuery<VersionSummary>(
    client,
    `SELECT ${SUMMARY_COLS}
     FROM public.project_versions
     WHERE project_id = $1
     ORDER BY version_num DESC`,
    [projectId]
  );
  return rows;
}

export async function getVersion(
  client: Client,
  versionId: string
): Promise<Version | null> {
  const { rows } = await typedQuery<Version>(
    client,
    `SELECT ${FULL_COLS} FROM public.project_versions WHERE id = $1`,
    [versionId]
  );
  return rows[0] ?? null;
}

export async function restoreVersion(
  client: Client,
  projectId: string,
  versionId: string
): Promise<void> {
  // Copy the version's scene_data back to projects.scene_data.
  const { rowCount } = await typedQuery<{ id: string }>(
    client,
    `UPDATE public.projects
     SET scene_data = pv.scene_data,
         updated_at = NOW()
     FROM public.project_versions pv
     WHERE pv.id = $1
       AND public.projects.id = pv.project_id
       AND public.projects.id = $2
     RETURNING public.projects.id`,
    [versionId, projectId]
  );
  if (rowCount === 0) throw new NotFoundError('Version not found');
  // Per Decision B, restore is a single-row UPDATE copying scene_data back.
  // There is no project_objects registry to re-sync.
}
