import pino from 'pino';
import { pool } from '../../shared/db/client';
import { resolvePublicUrl } from '../../shared/storage/storageClient';
import { AppError } from '../../shared/errors/AppError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as repo from './materials.repository';
import type { Material, MaterialCategory, CompatMatrixEntry, CompatOverrideEntry } from './materials.types';
import type { MaterialSearchQuery } from './materials.schema';

const logger = pino({ name: 'materials.service' });

// ─── In-memory compatibility cache ──────────────────────────────────────────
interface CompatCache {
  // category-level: objectCategoryId → Set<materialCategoryId>
  matrix: Map<string, Set<string>>;
  // per-object overrides: libraryObjectId → Map<materialCategoryId, allow>
  overrides: Map<string, Map<string, boolean>>;
  loadedAt: number;
}

let compatCache: CompatCache | null = null;
const COMPAT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildCompatCache(
  matrix: CompatMatrixEntry[],
  overrides: CompatOverrideEntry[]
): CompatCache {
  const matrixMap = new Map<string, Set<string>>();
  for (const row of matrix) {
    let set = matrixMap.get(row.objectCategoryId);
    if (!set) {
      set = new Set();
      matrixMap.set(row.objectCategoryId, set);
    }
    set.add(row.materialCategoryId);
  }

  const overridesMap = new Map<string, Map<string, boolean>>();
  for (const row of overrides) {
    let map = overridesMap.get(row.libraryObjectId);
    if (!map) {
      map = new Map();
      overridesMap.set(row.libraryObjectId, map);
    }
    map.set(row.materialCategoryId, row.allow);
  }

  return { matrix: matrixMap, overrides: overridesMap, loadedAt: Date.now() };
}

export async function warmupCompatibilityCache(): Promise<void> {
  try {
    const { matrix, overrides } = await repo.loadCompatibilityMatrix(pool);
    compatCache = buildCompatCache(matrix, overrides);
    logger.info({ matrixRows: matrix.length, overrideRows: overrides.length }, 'Compatibility cache warmed up');
  } catch (err) {
    // The startup DB ping in server.ts already surfaces connectivity failures
    // with a full stack trace and actionable message. Suppress the redundant
    // stack dump here and emit a single-line warning instead.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ msg: message }, 'Failed to warm up compatibility cache — cache will be loaded on first request');
  }
}

async function getCompatCache(): Promise<CompatCache> {
  const now = Date.now();
  if (compatCache && now - compatCache.loadedAt < COMPAT_TTL_MS) {
    return compatCache;
  }
  // Reload asynchronously; if already loading, just reload.
  const { matrix, overrides } = await repo.loadCompatibilityMatrix(pool);
  compatCache = buildCompatCache(matrix, overrides);
  return compatCache;
}

// ─── URL resolution ──────────────────────────────────────────────────────────

function resolveMaterialUrls(m: Material): Material {
  return {
    ...m,
    thumbnailUrl: resolvePublicUrl(m.thumbnailUrl),
    albedoUrl: m.albedoUrl ? resolvePublicUrl(m.albedoUrl) : null,
    normalUrl: m.normalUrl ? resolvePublicUrl(m.normalUrl) : null,
    roughnessUrl: m.roughnessUrl ? resolvePublicUrl(m.roughnessUrl) : null,
    metalnessUrl: m.metalnessUrl ? resolvePublicUrl(m.metalnessUrl) : null,
    aoUrl: m.aoUrl ? resolvePublicUrl(m.aoUrl) : null,
  };
}

// ─── Public service functions ────────────────────────────────────────────────

export async function listMaterials(
  query: MaterialSearchQuery
): Promise<{ data: Material[]; nextCursor: string | null }> {
  let cursor: ReturnType<typeof repo.decodeCursor> = null;
  if (query.cursor) {
    cursor = repo.decodeCursor(query.cursor);
    if (!cursor) throw new AppError('Invalid cursor', 400, 'BAD_REQUEST');
  }

  const rows = await repo.listMaterials(pool, { categoryId: query.categoryId }, cursor, query.limit);
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
    { categoryId: query.categoryId },
    Math.min(query.limit, 20)
  );
  return { data: rows.map(resolveMaterialUrls) };
}

export async function getMaterialById(id: string): Promise<Material> {
  const mat = await repo.getMaterialById(pool, id);
  if (!mat) throw new NotFoundError('Material not found');
  return resolveMaterialUrls(mat);
}

export async function getCompatibleMaterials(
  objectId: string
): Promise<{ data: Material[]; categories: MaterialCategory[] }> {
  // Try in-memory cache first to resolve allowed category IDs.
  // We need the library object's category_id to look up in the matrix.
  // Since the cache is keyed by objectCategoryId (not objectId), we need
  // to either know the category, or fall back to the SQL function.
  //
  // Strategy: always call the SQL function (it's fast, sub-ms with indexes).
  // The in-memory cache is used for bulk lookups (e.g. warmup health check).
  // TODO: if performance requires it, also cache object→category mapping.

  const categories = await repo.getCompatibleMaterialCategories(pool, objectId);
  if (categories.length === 0) {
    return { data: [], categories: [] };
  }

  const categoryIds = categories.map((c) => c.id);
  const materials = await repo.getMaterialsByCategories(pool, categoryIds);

  return {
    data: materials.map(resolveMaterialUrls),
    categories,
  };
}
