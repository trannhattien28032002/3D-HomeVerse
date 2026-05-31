import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import type { Share, SharePermission } from './sharing.types';

type Client = Pool | PoolClient;

const SHARE_COLS = `
  id, project_id, shared_with, permission, token, expires_at, created_by, created_at
`;

interface CreateShareData {
  projectId: string;
  createdBy: string;
  sharedWith?: string;
  permission: SharePermission;
  expiresAt?: string;
  token?: string;
}

export async function createShare(
  client: Client,
  data: CreateShareData
): Promise<Share> {
  const { rows } = await typedQuery<Share>(
    client,
    `INSERT INTO public.project_shares
       (project_id, created_by, shared_with, permission, expires_at, token)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SHARE_COLS}`,
    [
      data.projectId,
      data.createdBy,
      data.sharedWith ?? null,
      data.permission,
      data.expiresAt ?? null,
      data.token ?? null,
    ]
  );
  return rows[0];
}

export async function findById(
  client: Client,
  shareId: string
): Promise<Share | null> {
  const { rows } = await typedQuery<Share>(
    client,
    `SELECT ${SHARE_COLS} FROM public.project_shares WHERE id = $1`,
    [shareId]
  );
  return rows[0] ?? null;
}

// Used by middleware (no circular dep — called with pool directly from auth middleware).
export async function findByToken(
  client: Client,
  token: string
): Promise<Share | null> {
  const { rows } = await typedQuery<Share>(
    client,
    `SELECT ${SHARE_COLS} FROM public.project_shares WHERE token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function listForProject(
  client: Client,
  projectId: string
): Promise<Share[]> {
  const { rows } = await typedQuery<Share>(
    client,
    `SELECT ${SHARE_COLS} FROM public.project_shares WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return rows;
}

export async function updateShare(
  client: Client,
  shareId: string,
  input: { permission?: SharePermission; expiresAt?: string | null }
): Promise<Share> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.permission !== undefined) {
    values.push(input.permission);
    fields.push(`permission = $${values.length}`);
  }
  if (input.expiresAt !== undefined) {
    values.push(input.expiresAt ?? null);
    fields.push(`expires_at = $${values.length}`);
  }

  if (fields.length === 0) {
    const existing = await findById(client, shareId);
    if (!existing) throw new NotFoundError('Share not found');
    return existing;
  }

  values.push(shareId);
  const { rows, rowCount } = await typedQuery<Share>(
    client,
    `UPDATE public.project_shares SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${SHARE_COLS}`,
    values
  );

  if (rowCount === 0) throw new NotFoundError('Share not found');
  return rows[0];
}

export async function deleteShare(client: Client, shareId: string): Promise<void> {
  const { rowCount } = await typedQuery<{ id: string }>(
    client,
    'DELETE FROM public.project_shares WHERE id = $1',
    [shareId]
  );
  if (rowCount === 0) throw new NotFoundError('Share not found');
}
