import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchLimiter } from '../../middleware/rateLimiter';
import { MaterialSearchQuerySchema } from './materials.schema';
import type { MaterialSearchQuery } from './materials.schema';
import * as service from './materials.service';

export const materialsRouter = Router();

// Material catalog is near-static reference data shared across all users — safe to
// cache at the HTTP layer.
const CATALOG_CACHE_CONTROL = 'public, max-age=300';

// GET /materials/search — FTS + trgm search (before /:slug to avoid route collision).
materialsRouter.get(
  '/search',
  searchLimiter,
  requireAuth,
  validate(MaterialSearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.searchMaterials(req.query as unknown as MaterialSearchQuery);
      res.set('Cache-Control', CATALOG_CACHE_CONTROL);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /materials — paginated material list.
materialsRouter.get(
  '/',
  requireAuth,
  validate(MaterialSearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.listMaterials(req.query as unknown as MaterialSearchQuery);
      res.set('Cache-Control', CATALOG_CACHE_CONTROL);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /materials/:slug — single material detail with resolved texture URLs.
materialsRouter.get(
  '/:slug',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mat = await service.getMaterialBySlug(String(req.params.slug));
      res.json(mat);
    } catch (err) {
      next(err);
    }
  }
);
