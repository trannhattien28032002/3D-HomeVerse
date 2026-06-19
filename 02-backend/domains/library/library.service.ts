import { pool } from '../../shared/db/client';
import { resolvePublicUrl } from '../../shared/storage/storageClient';
import { AppError } from '../../shared/errors/AppError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as repo from './library.repository';
import type { LibraryObject, LibraryObjectDetail } from './library.types';
import type { LibrarySearchQuery } from './library.schema';

// In-memory distinct-category cache with TTL (Decision B caching plan).
interface CategoryCache {
  categories: string[];
  loadedAt: number;
}

let categoryCache: CategoryCache | null = null;
const CATEGORY_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadCategories(): Promise<string[]> {
  const now = Date.now();
  if (categoryCache && now - categoryCache.loadedAt < CATEGORY_TTL_MS) {
    return categoryCache.categories;
  }
  const categories = await repo.listCategories(pool);
  categoryCache = { categories, loadedAt: now };
  return categories;
}

function resolveObjectUrls(obj: LibraryObject): LibraryObjectDetail {
  // Storage paths are resolved to CDN URLs. Slug `id` and the inner material
  // slot/binding shapes are returned unchanged (Decision A).
  // TODO (RQ-6): for premium objects, generate signed URLs instead of public CDN URLs.
  return {
    ...obj,
    modelUrl: resolvePublicUrl(obj.modelUrl),
    thumbnailUrl: obj.thumbnailUrl ? resolvePublicUrl(obj.thumbnailUrl) : null,
    topdownUrl: obj.topdownUrl ? resolvePublicUrl(obj.topdownUrl) : null,
  };
}

// Distinct category slugs (for filter chips).
export async function getCategories(): Promise<string[]> {
  return loadCategories();
}

export async function listObjects(
  query: LibrarySearchQuery
): Promise<{ data: LibraryObjectDetail[]; nextCursor: string | null }> {
  let cursor: ReturnType<typeof repo.decodeCursor> = null;
  if (query.cursor) {
    cursor = repo.decodeCursor(query.cursor);
    if (!cursor) throw new AppError('Invalid cursor', 400, 'BAD_REQUEST');
  }

  const filters = { category: query.category, isPremium: query.isPremium };

  const rows = await repo.listObjects(pool, filters, cursor, query.limit);
  const hasMore = rows.length > query.limit;
  const data = (hasMore ? rows.slice(0, query.limit) : rows).map(resolveObjectUrls);

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = data[data.length - 1];
    nextCursor = repo.encodeCursor(last.name, last.id);
  }

  return { data, nextCursor };
}

export async function searchObjects(
  query: LibrarySearchQuery
): Promise<{ data: LibraryObjectDetail[] }> {
  if (!query.q) throw new AppError('Search query (q) is required', 400, 'BAD_REQUEST');

  const filters = { category: query.category };

  // Search results are capped at 20 per spec.
  const rows = await repo.searchObjects(pool, query.q, filters, Math.min(query.limit, 20));
  return { data: rows.map(resolveObjectUrls) };
}

export async function getObjectBySlug(slug: string): Promise<LibraryObjectDetail> {
  const obj = await repo.getObjectBySlug(pool, slug);
  if (!obj) throw new NotFoundError('Library object not found');
  return resolveObjectUrls(obj);
}
