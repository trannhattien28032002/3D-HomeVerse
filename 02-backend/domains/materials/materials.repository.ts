import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import type { Material, MaterialCategory, CompatMatrixEntry, CompatOverrideEntry } from './materials.types';

type Client = Pool | PoolClient;

interface MaterialCursor {
  name: string;
  id: string;
}

const MAT_COLS = `
  id, category_id, slug, name, description,
  albedo_url, normal_url, roughness_url, metalness_url, ao_url,
  thumbnail_url, pbr_defaults, tags, is_premium, is_active,
  deleted_at, created_at, updated_at
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
  filters: { categoryId?: string },
  cursor: MaterialCursor | null,
  limit: number
): Promise<Material[]> {
  const conditions = ['m.is_active = TRUE', 'm.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`m.category_id = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor.name);
    params.push(cursor.id);
    conditions.push(
      `(m.name > $${params.length - 1} OR (m.name = $${params.length - 1} AND m.id > $${params.length}::uuid))`
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
  filters: { categoryId?: string },
  limit: number
): Promise<Material[]> {
  const conditions = [
    'm.is_active = TRUE',
    'm.deleted_at IS NULL',
    `(m.search_vector @@ plainto_tsquery('english', $1) OR m.name % $1)`,
  ];
  const params: unknown[] = [q];

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`m.category_id = $${params.length}`);
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

export async function getMaterialById(
  client: Client,
  id: string
): Promise<Material | null> {
  const { rows } = await typedQuery<Material>(
    client,
    `SELECT ${MAT_COLS}
     FROM public.materials
     WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

// Calls the compatible_material_categories SQL function.
export async function getCompatibleMaterialCategories(
  client: Client,
  objectId: string
): Promise<MaterialCategory[]> {
  const { rows } = await typedQuery<MaterialCategory>(
    client,
    'SELECT id, slug, name FROM public.compatible_material_categories($1)',
    [objectId]
  );
  return rows;
}

// Load ALL category_material_compat rows for in-memory cache warmup.
export async function loadCompatibilityMatrix(client: Client): Promise<{
  matrix: CompatMatrixEntry[];
  overrides: CompatOverrideEntry[];
}> {
  const [matrixResult, overridesResult] = await Promise.all([
    typedQuery<CompatMatrixEntry>(
      client,
      'SELECT object_category_id, material_category_id FROM public.category_material_compat',
      []
    ),
    typedQuery<CompatOverrideEntry>(
      client,
      'SELECT library_object_id, material_category_id, allow FROM public.object_material_compat_override',
      []
    ),
  ]);
  return { matrix: matrixResult.rows, overrides: overridesResult.rows };
}

// Get all materials whose category is in the given set of category IDs.
export async function getMaterialsByCategories(
  client: Client,
  categoryIds: string[]
): Promise<Material[]> {
  if (categoryIds.length === 0) return [];
  const { rows } = await typedQuery<Material>(
    client,
    `SELECT ${MAT_COLS}
     FROM public.materials
     WHERE category_id = ANY($1::uuid[])
       AND is_active = TRUE
       AND deleted_at IS NULL
     ORDER BY name`,
    [categoryIds]
  );
  return rows;
}
