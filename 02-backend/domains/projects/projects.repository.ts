import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import type { ProjectMeta, CreateProjectInput, UpdateProjectMetaInput } from './projects.types';
import type { ListProjectsCursor } from './projects.types';

type Client = Pool | PoolClient;

const META_COLS = `
  id, owner_id, name, thumbnail_url, floor_count,
  is_template, is_public, deleted_at, created_at, updated_at
`;

// Decode a base64 opaque cursor. Returns null if malformed.
export function decodeCursor(cursor: string): ListProjectsCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(decoded) as ListProjectsCursor;
  } catch {
    return null;
  }
}

// Encode a cursor from updatedAt and id.
export function encodeCursor(updatedAt: Date | string, id: string): string {
  const payload: ListProjectsCursor = {
    updatedAt: typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export async function findById(
  client: Client,
  id: string
): Promise<ProjectMeta | null> {
  const { rows } = await typedQuery<ProjectMeta>(
    client,
    `SELECT ${META_COLS} FROM public.projects WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findByIdIncludingDeleted(
  client: Client,
  id: string
): Promise<ProjectMeta | null> {
  const { rows } = await typedQuery<ProjectMeta>(
    client,
    `SELECT ${META_COLS} FROM public.projects WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listByOwner(
  client: Client,
  ownerId: string,
  cursor: ListProjectsCursor | null,
  limit: number,
  sort: 'updatedAt' | 'createdAt' | 'name'
): Promise<ProjectMeta[]> {
  const colMap: Record<string, string> = {
    updatedAt: 'updated_at',
    createdAt: 'created_at',
    name: 'name',
  };
  const sortCol = colMap[sort];

  if (!cursor) {
    const { rows } = await typedQuery<ProjectMeta>(
      client,
      `SELECT ${META_COLS}
       FROM public.projects
       WHERE owner_id = $1 AND deleted_at IS NULL
       ORDER BY ${sortCol} DESC, id DESC
       LIMIT $2`,
      [ownerId, limit + 1]
    );
    return rows;
  }

  // Cursor-based pagination using (sortCol, id) tuple.
  // For DESC ordering: next page means (sortCol < cursor.sortVal) OR (sortCol = cursor.sortVal AND id < cursor.id).
  let sql: string;
  let params: unknown[];

  if (sort === 'name') {
    // name ASC for name sort, cursor is (name, id).
    sql = `SELECT ${META_COLS}
           FROM public.projects
           WHERE owner_id = $1 AND deleted_at IS NULL
             AND (name > $2 OR (name = $2 AND id > $3))
           ORDER BY name ASC, id ASC
           LIMIT $4`;
    params = [ownerId, cursor.updatedAt, cursor.id, limit + 1];
  } else {
    sql = `SELECT ${META_COLS}
           FROM public.projects
           WHERE owner_id = $1 AND deleted_at IS NULL
             AND (${sortCol} < $2 OR (${sortCol} = $2 AND id < $3))
           ORDER BY ${sortCol} DESC, id DESC
           LIMIT $4`;
    params = [ownerId, cursor.updatedAt, cursor.id, limit + 1];
  }

  const { rows } = await typedQuery<ProjectMeta>(client, sql, params);
  return rows;
}

export async function create(
  client: Client,
  ownerId: string,
  input: CreateProjectInput
): Promise<ProjectMeta> {
  const { rows } = await typedQuery<ProjectMeta>(
    client,
    `INSERT INTO public.projects (owner_id, name, floor_count)
     VALUES ($1, $2, $3)
     RETURNING ${META_COLS}`,
    [ownerId, input.name ?? 'Untitled Project', input.floorCount ?? 1]
  );
  return rows[0];
}

export async function updateMeta(
  client: Client,
  id: string,
  input: UpdateProjectMetaInput
): Promise<ProjectMeta> {
  const colMap: Record<string, string> = {
    name: 'name',
    thumbnailUrl: 'thumbnail_url',
    isTemplate: 'is_template',
    isPublic: 'is_public',
  };

  const entries = Object.entries(input).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    const existing = await findById(client, id);
    if (!existing) throw new NotFoundError('Project not found');
    return existing;
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of entries) {
    const col = colMap[key];
    if (!col) continue;
    values.push(value);
    setClauses.push(`${col} = $${values.length}`);
  }

  values.push(id);
  const { rows, rowCount } = await typedQuery<ProjectMeta>(
    client,
    `UPDATE public.projects
     SET ${setClauses.join(', ')}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING ${META_COLS}`,
    values
  );

  if (rowCount === 0) throw new NotFoundError('Project not found');
  return rows[0];
}

export async function softDelete(client: Client, id: string): Promise<void> {
  const { rowCount } = await typedQuery<ProjectMeta>(
    client,
    `UPDATE public.projects SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (rowCount === 0) throw new NotFoundError('Project not found');
}

export async function restore(client: Client, id: string): Promise<ProjectMeta> {
  const { rows, rowCount } = await typedQuery<ProjectMeta>(
    client,
    `UPDATE public.projects SET deleted_at = NULL WHERE id = $1
     RETURNING ${META_COLS}`,
    [id]
  );
  if (rowCount === 0) throw new NotFoundError('Project not found');
  return rows[0];
}

// Single-row copy of a project, including scene_data (Decision B). There is no
// project_objects copy leg, so this is a standalone statement (no transaction).
export async function duplicateProjectRow(
  client: Client,
  sourceId: string,
  newOwnerId: string
): Promise<{ id: string; name: string }> {
  const { rows } = await typedQuery<{ id: string; name: string }>(
    client,
    `INSERT INTO public.projects (owner_id, name, scene_data, floor_count, is_template, is_public)
     SELECT $2, name || ' (Copy)', scene_data, floor_count, is_template, is_public
     FROM public.projects
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name`,
    [sourceId, newOwnerId]
  );

  if (!rows[0]) throw new NotFoundError('Source project not found');
  return rows[0];
}
