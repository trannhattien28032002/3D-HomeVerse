import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { Category, LibraryObject } from './library.types';

type Client = Pool | PoolClient;

interface LibraryFilters {
  categoryId?: string;
  placement?: string;
  tags?: string[];
  isPremium?: boolean;
}

interface LibraryCursor {
  name: string;
  id: string;
}

const OBJ_COLS = `
  id, category_id, slug, name, description, model_url, thumbnail_url, lod_urls,
  placement, bounding_box, tags, metadata, is_premium, is_active, deleted_at,
  created_at, updated_at
`;

export async function listCategories(client: Client): Promise<Category[]> {
  const { rows } = await typedQuery<Category>(
    client,
    `SELECT id, parent_id, slug, name, icon_url, sort_order, created_at
     FROM public.object_categories
     ORDER BY sort_order, name`,
    []
  );
  return rows;
}

export async function listObjects(
  client: Client,
  filters: LibraryFilters,
  cursor: LibraryCursor | null,
  limit: number
): Promise<LibraryObject[]> {
  const conditions: string[] = ['lo.is_active = TRUE', 'lo.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`lo.category_id = $${params.length}`);
  }
  if (filters.placement) {
    params.push(filters.placement);
    conditions.push(`lo.placement = $${params.length}::placement_surface`);
  }
  if (filters.tags && filters.tags.length > 0) {
    params.push(filters.tags);
    conditions.push(`lo.tags && $${params.length}::text[]`);
  }
  if (filters.isPremium !== undefined) {
    params.push(filters.isPremium);
    conditions.push(`lo.is_premium = $${params.length}`);
  }

  // Cursor: (name, id) pair for stable keyset pagination.
  if (cursor) {
    params.push(cursor.name);
    params.push(cursor.id);
    conditions.push(
      `(lo.name > $${params.length - 1} OR (lo.name = $${params.length - 1} AND lo.id > $${params.length}::uuid))`
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

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`lo.category_id = $${params.length}`);
  }
  if (filters.placement) {
    params.push(filters.placement);
    conditions.push(`lo.placement = $${params.length}::placement_surface`);
  }
  if (filters.tags && filters.tags.length > 0) {
    params.push(filters.tags);
    conditions.push(`lo.tags && $${params.length}::text[]`);
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

export async function getObjectById(
  client: Client,
  id: string
): Promise<LibraryObject | null> {
  const { rows } = await typedQuery<LibraryObject>(
    client,
    `SELECT ${OBJ_COLS}
     FROM public.library_objects
     WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [id]
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
