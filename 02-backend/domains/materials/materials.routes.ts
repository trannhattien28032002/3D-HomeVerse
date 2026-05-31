import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchLimiter } from '../../middleware/rateLimiter';
import { MaterialSearchQuerySchema } from './materials.schema';
import type { MaterialSearchQuery } from './materials.schema';
import * as service from './materials.service';

export const materialsRouter = Router();

// GET /materials/search — FTS + trgm search (before /:id to avoid route collision).
materialsRouter.get(
  '/search',
  searchLimiter,
  requireAuth,
  validate(MaterialSearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.searchMaterials(req.query as unknown as MaterialSearchQuery);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /materials/compatible/:objectId — compatible materials for a library object.
materialsRouter.get(
  '/compatible/:objectId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.getCompatibleMaterials(String(req.params.objectId));
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
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /materials/:id — single material detail.
materialsRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const mat = await service.getMaterialById(String(req.params.id));
      res.json(mat);
    } catch (err) {
      next(err);
    }
  }
);
