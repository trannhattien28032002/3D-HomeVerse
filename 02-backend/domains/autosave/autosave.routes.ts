import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { autosaveLimiter } from '../../middleware/rateLimiter';
import { CreateAutosaveSchema } from './autosave.schema';
import * as service from './autosave.service';

// Mounted at /projects in app.ts — handles /projects/:id/autosave paths.
export const autosaveRouter = Router();

// POST /projects/:id/autosave — insert autosave, prune to keep last 5.
autosaveRouter.post(
  '/:id/autosave',
  autosaveLimiter,
  requireAuth,
  validate(CreateAutosaveSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.createAutosave(
        req.user!.id,
        String(req.params.id),
        req.body,
        req.shareContext
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /projects/:id/autosave/latest — get the most recent autosave.
autosaveRouter.get(
  '/:id/autosave/latest',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const autosave = await service.getLatest(req.user!.id, String(req.params.id), req.shareContext);
      res.json(autosave);
    } catch (err) {
      next(err);
    }
  }
);
