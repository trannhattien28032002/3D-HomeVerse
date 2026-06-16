import { pool } from '../../shared/db/client';
import { resolvePublicUrl } from '../../shared/storage/storageClient';
import { AppError } from '../../shared/errors/AppError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as repo from './library.repository';
import type { Category, CategoryTree, LibraryObject, LibraryObjectDetail } from './library.types';
import type { LibrarySearchQuery } from './library.schema';

// In-memory category tree cache with TTL.
interface CategoryCache {
  tree: CategoryTree[];
  loadedAt: number;
}

let categoryCache: CategoryCache | null = null;
const CATEGORY_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildTree(flat: Category[]): CategoryTree[] {
  const map = new Map<string, CategoryTree>();
  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] });
  }
  const roots: CategoryTree[] = [];
  for (const node of map.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }
  return roots.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function loadCategories(): Promise<CategoryTree[]> {
  const now = Date.now();
  if (categoryCache && now - categoryCache.loadedAt < CATEGORY_TTL_MS) {
    return categoryCache.tree;
  }
  const flat = await repo.listCategories(pool);
  const tree = buildTree(flat);
  categoryCache = { tree, loadedAt: now };
  return tree;
}

function resolveObjectUrls(obj: LibraryObject): LibraryObjectDetail {
  const resolved: LibraryObjectDetail = {
    ...obj,
    modelUrl: resolvePublicUrl(obj.modelUrl),
    thumbnailUrl: resolvePublicUrl(obj.thumbnailUrl),
    lodUrls: obj.lodUrls
      ? Object.fromEntries(
          Object.entries(obj.lodUrls).map(([k, v]) => [k, resolvePublicUrl(v as string)])
        )
      : null,
  };
  // TODO (RQ-6): For premium objects, generate signed URLs instead of public CDN URLs.
  return resolved;
}

export async function getCategoryTree(): Promise<CategoryTree[]> {
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

  const filters = {
    categoryId: query.categoryId,
    placement: query.placement,
    tags: query.tags ? query.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    isPremium: query.isPremium,
  };

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

export async function searchObjects(query: LibrarySearchQuery): Promise<{ data: LibraryObjectDetail[] }> {
  if (!query.q) throw new AppError('Search query (q) is required', 400, 'BAD_REQUEST');

  const filters = {
    categoryId: query.categoryId,
    placement: query.placement,
    tags: query.tags ? query.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
  };

  // Search results are capped at 20 per spec.
  const rows = await repo.searchObjects(pool, query.q, filters, Math.min(query.limit, 20));
  return { data: rows.map(resolveObjectUrls) };
}

export async function getObjectById(id: string): Promise<LibraryObjectDetail> {
  const obj = await repo.getObjectById(pool, id);
  if (!obj) throw new NotFoundError('Library object not found');
  return resolveObjectUrls(obj);
}
