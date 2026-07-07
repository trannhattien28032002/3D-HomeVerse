import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { CreateVersionSchema } from './versions.schema';
import * as service from './versions.service';

// Mounted at /projects in app.ts — handles /projects/:id/versions paths.
export const versionsRouter = Router();

// GET /projects/:id/versions — list versions (newest first, no scene_data).
versionsRouter.get(
  '/:id/versions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await service.listVersions(req.user!.id, String(req.params.id));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/versions — create a named snapshot of current scene.
versionsRouter.post(
  '/:id/versions',
  requireAuth,
  validate(CreateVersionSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const version = await service.createVersion(req.user!.id, String(req.params.id), req.body.label);
      res.status(201).json(version);
    } catch (err) {
      next(err);
    }
  }
);

// GET /projects/:id/versions/:vid — get single version with full scene_data.
versionsRouter.get(
  '/:id/versions/:vid',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const version = await service.getVersion(
        req.user!.id,
        String(req.params.id),
        String(req.params.vid)
      );
      res.json(version);
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/versions/:vid/restore — restore project to this version.
versionsRouter.post(
  '/:id/versions/:vid/restore',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.restoreVersion(
        req.user!.id,
        String(req.params.id),
        String(req.params.vid)
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
