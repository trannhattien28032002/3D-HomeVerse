import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchLimiter } from '../../middleware/rateLimiter';
import { LibrarySearchQuerySchema } from './library.schema';
import type { LibrarySearchQuery } from './library.schema';
import * as service from './library.service';

export const libraryRouter = Router();

// Catalog data (objects/categories) is near-static reference data shared across all
// users (no per-user fields in the response today) — safe to cache at the HTTP layer.
const CATALOG_CACHE_CONTROL = 'public, max-age=300';

// GET /library/categories — distinct category slugs (cached 5 min).
libraryRouter.get(
  '/categories',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await service.getCategories();
      res.set('Cache-Control', CATALOG_CACHE_CONTROL);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// GET /library/objects/search — FTS + trigram search (must be before /:slug route).
libraryRouter.get(
  '/objects/search',
  searchLimiter,
  requireAuth,
  validate(LibrarySearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.searchObjects(req.query as unknown as LibrarySearchQuery);
      res.set('Cache-Control', CATALOG_CACHE_CONTROL);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /library/objects — paginated object list with filters.
libraryRouter.get(
  '/objects',
  requireAuth,
  validate(LibrarySearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.listObjects(req.query as unknown as LibrarySearchQuery);
      res.set('Cache-Control', CATALOG_CACHE_CONTROL);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /library/objects/:slug — single object detail with resolved URLs.
libraryRouter.get(
  '/objects/:slug',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const obj = await service.getObjectBySlug(String(req.params.slug));
      res.json(obj);
    } catch (err) {
      next(err);
    }
  }
);
