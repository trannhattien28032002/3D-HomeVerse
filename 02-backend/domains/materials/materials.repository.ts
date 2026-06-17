import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { Material } from './materials.types';

type Client = Pool | PoolClient;

interface MaterialCursor {
  name: string;
  id: string;
}

const MAT_COLS = `
  id, name, category, icon_url, textures,
  is_premium, is_active, deleted_at, created_at, updated_at
`;

export function decodeCursor(cursor: string): MaterialCursor | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as MaterialCursor;
  } catch {
    return null;
  }
}

export function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify({ name, id })).toString('base64');
}

export async function listMaterials(
  client: Client,
  filters: { category?: string },
  cursor: MaterialCursor | null,
  limit: number
): Promise<Material[]> {
  const conditions = ['m.is_active = TRUE', 'm.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`m.category = $${params.length}`);
  }

  // Cursor: (name, id) keyset pagination. id is a TEXT slug.
  if (cursor) {
    params.push(cursor.name);
    params.push(cursor.id);
    conditions.push(
      `(m.name > $${params.length - 1} OR (m.name = $${params.length - 1} AND m.id > $${params.length}))`
    );
  }

  params.push(limit + 1);

  const { rows } = await typedQuery<Material>(
    client,
    `SELECT ${MAT_COLS}
     FROM public.materials m
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.name, m.id
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function searchMaterials(
  client: Client,
  q: string,
  filters: { category?: string },
  limit: number
): Promise<Material[]> {
  const conditions = [
    'm.is_active = TRUE',
    'm.deleted_at IS NULL',
    `(m.search_vector @@ plainto_tsquery('english', $1) OR m.name % $1)`,
  ];
  const params: unknown[] = [q];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`m.category = $${params.length}`);
  }

  params.push(limit);

  const { rows } = await typedQuery<Material>(
    client,
    `SELECT ${MAT_COLS},
            ts_rank(m.search_vector, plainto_tsquery('english', $1)) AS rank
     FROM public.materials m
     WHERE ${conditions.join(' AND ')}
     ORDER BY rank DESC, m.name
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getMaterialBySlug(
  client: Client,
  slug: string
): Promise<Material | null> {
  const { rows } = await typedQuery<Material>(
    client,
    `SELECT ${MAT_COLS}
     FROM public.materials
     WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [slug]
  );
  return rows[0] ?? null;
}
