import { pool } from '../../shared/db/client';
import { resolvePublicUrl } from '../../shared/storage/storageClient';
import { AppError } from '../../shared/errors/AppError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as repo from './materials.repository';
import type { Material, MaterialTextures } from './materials.types';
import type { MaterialSearchQuery } from './materials.schema';

// Compatibility is per-slot inside each library object (materialSlots[].allowedCategories)
// and resolved client-side (Decision B). This service only serves the slug-keyed catalog;
// there is no compatibility cache, matrix, or "compatible materials for object" endpoint.

function resolveMaterialUrls(m: Material): Material {
  const textures: MaterialTextures = {};
  for (const key of ['color', 'normal', 'roughness', 'ao'] as const) {
    const path = m.textures?.[key];
    if (path) textures[key] = resolvePublicUrl(path);
  }
  return {
    ...m,
    iconUrl: m.iconUrl ? resolvePublicUrl(m.iconUrl) : null,
    textures,
  };
}

export async function listMaterials(
  query: MaterialSearchQuery
): Promise<{ data: Material[]; nextCursor: string | null }> {
  let cursor: ReturnType<typeof repo.decodeCursor> = null;
  if (query.cursor) {
    cursor = repo.decodeCursor(query.cursor);
    if (!cursor) throw new AppError('Invalid cursor', 400, 'BAD_REQUEST');
  }

  const rows = await repo.listMaterials(pool, { category: query.category }, cursor, query.limit);
  const hasMore = rows.length > query.limit;
  const data = (hasMore ? rows.slice(0, query.limit) : rows).map(resolveMaterialUrls);

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = data[data.length - 1];
    nextCursor = repo.encodeCursor(last.name, last.id);
  }

  return { data, nextCursor };
}

export async function searchMaterials(
  query: MaterialSearchQuery
): Promise<{ data: Material[] }> {
  if (!query.q) throw new AppError('Search query (q) is required', 400, 'BAD_REQUEST');
  const rows = await repo.searchMaterials(
    pool,
    query.q,
    { category: query.category },
    Math.min(query.limit, 20)
  );
  return { data: rows.map(resolveMaterialUrls) };
}

export async function getMaterialBySlug(slug: string): Promise<Material> {
  const mat = await repo.getMaterialBySlug(pool, slug);
  if (!mat) throw new NotFoundError('Material not found');
  return resolveMaterialUrls(mat);
}
