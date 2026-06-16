import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchLimiter } from '../../middleware/rateLimiter';
import { LibrarySearchQuerySchema } from './library.schema';
import type { LibrarySearchQuery } from './library.schema';
import * as service from './library.service';

export const libraryRouter = Router();

// GET /library/categories — full category tree (cached 5 min).
libraryRouter.get(
  '/categories',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await service.getCategoryTree();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// GET /library/objects/search — FTS + trigram search (must be before /:id route).
libraryRouter.get(
  '/objects/search',
  searchLimiter,
  requireAuth,
  validate(LibrarySearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.searchObjects(req.query as unknown as LibrarySearchQuery);
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
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /library/objects/:id — single object detail with resolved URLs.
libraryRouter.get(
  '/objects/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const obj = await service.getObjectById(String(req.params.id));
      res.json(obj);
    } catch (err) {
      next(err);
    }
  }
);
