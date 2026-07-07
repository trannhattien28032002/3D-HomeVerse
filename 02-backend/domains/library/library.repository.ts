import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { LibraryObject } from './library.types';

type Client = Pool | PoolClient;

interface LibraryFilters {
  category?: string; // category slug
  isPremium?: boolean;
}

interface LibraryCursor {
  name: string;
  id: string;
}

const OBJ_COLS = `
  id, name, category, model_url, thumbnail_url, topdown_url,
  bounding_box, collision_box, placement, material_slots, material_bindings,
  is_premium, is_active, deleted_at, created_at, updated_at
`;

// Distinct category slugs in use (for filter chips). Decision A — no object_categories table.
export async function listCategories(client: Client): Promise<string[]> {
  const { rows } = await typedQuery<{ category: string }>(
    client,
    `SELECT DISTINCT category
     FROM public.library_objects
     WHERE is_active = TRUE AND deleted_at IS NULL
     ORDER BY category`,
    []
  );
  return rows.map((r) => r.category);
}

export async function listObjects(
  client: Client,
  filters: LibraryFilters,
  cursor: LibraryCursor | null,
  limit: number
): Promise<LibraryObject[]> {
  const conditions: string[] = ['lo.is_active = TRUE', 'lo.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`lo.category = $${params.length}`);
  }
  if (filters.isPremium !== undefined) {
    params.push(filters.isPremium);
    conditions.push(`lo.is_premium = $${params.length}`);
  }

  // Cursor: (name, id) pair for stable keyset pagination. id is a TEXT slug.
  if (cursor) {
    params.push(cursor.name);
    params.push(cursor.id);
    conditions.push(
      `(lo.name > $${params.length - 1} OR (lo.name = $${params.length - 1} AND lo.id > $${params.length}))`
    );
  }

  params.push(limit + 1);
  const whereClause = conditions.join(' AND ');

  const { rows } = await typedQuery<LibraryObject>(
    client,
    `SELECT ${OBJ_COLS}
     FROM public.library_objects lo
     WHERE ${whereClause}
     ORDER BY lo.name, lo.id
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function searchObjects(
  client: Client,
  q: string,
  filters: LibraryFilters,
  limit: number
): Promise<LibraryObject[]> {
  const conditions: string[] = [
    'lo.is_active = TRUE',
    'lo.deleted_at IS NULL',
    `(lo.search_vector @@ plainto_tsquery('english', $1) OR lo.name % $1)`,
  ];
  const params: unknown[] = [q];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`lo.category = $${params.length}`);
  }

  params.push(limit);
  const whereClause = conditions.join(' AND ');

  const { rows } = await typedQuery<LibraryObject>(
    client,
    `SELECT ${OBJ_COLS},
            ts_rank(lo.search_vector, plainto_tsquery('english', $1)) AS rank
     FROM public.library_objects lo
     WHERE ${whereClause}
     ORDER BY rank DESC, lo.name
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getObjectBySlug(
  client: Client,
  slug: string
): Promise<LibraryObject | null> {
  const { rows } = await typedQuery<LibraryObject>(
    client,
    `SELECT ${OBJ_COLS}
     FROM public.library_objects
     WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [slug]
  );
  return rows[0] ?? null;
}

// Decode cursor from base64.
export function decodeCursor(cursor: string): LibraryCursor | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as LibraryCursor;
  } catch {
    return null;
  }
}

export function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify({ name, id })).toString('base64');
}
