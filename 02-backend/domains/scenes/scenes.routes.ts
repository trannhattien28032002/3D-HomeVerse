import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { SaveSceneBodySchema } from './scenes.schema';
import * as service from './scenes.service';

// These routes are mounted under /projects in app.ts.
// Path: /projects/:id/scene
export const scenesRouter = Router({ mergeParams: true });

// GET /projects/:id/scene — load full scene.
scenesRouter.get(
  '/:id/scene',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.loadScene(req.user!.id, String(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /projects/:id/scene — save full scene (atomic).
scenesRouter.put(
  '/:id/scene',
  requireAuth,
  validate(SaveSceneBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.saveScene(req.user!.id, String(req.params.id), req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
