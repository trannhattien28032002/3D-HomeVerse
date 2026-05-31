import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, attachUserIfPresent } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { CreateShareSchema, UpdateShareSchema } from './sharing.schema';
import * as service from './sharing.service';
import * as projectsRepo from '../projects/projects.repository';
import { pool } from '../../shared/db/client';

// ── Sharing routes nested under /projects/:id/share ─────────────────────────
export const sharingRouter = Router();

// GET /projects/:id/share — list shares for a project (owner only).
sharingRouter.get(
  '/:id/share',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await service.listShares(req.user!.id, String(req.params.id));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/share — create a named-user or link share.
sharingRouter.post(
  '/:id/share',
  requireAuth,
  validate(CreateShareSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const share = await service.createShare(req.user!.id, String(req.params.id), req.body);
      res.status(201).json(share);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /projects/:id/share/:shareId — update permission or expiry.
sharingRouter.patch(
  '/:id/share/:shareId',
  requireAuth,
  validate(UpdateShareSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const share = await service.updateShare(
        req.user!.id,
        String(req.params.id),
        String(req.params.shareId),
        req.body
      );
      res.json(share);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id/share/:shareId — revoke a share.
sharingRouter.delete(
  '/:id/share/:shareId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await service.revokeShare(req.user!.id, String(req.params.id), String(req.params.shareId));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ── Public share token resolution — mounted at /share in app.ts ─────────────
export const publicShareRouter = Router();

// GET /share/:token — resolve a share token (no auth required, also works with JWT).
publicShareRouter.get(
  '/:token',
  attachUserIfPresent,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { share, projectId } = await service.resolveShareToken(String(req.params.token));
      // Fetch project metadata to return alongside permission.
      const project = await projectsRepo.findById(pool, projectId);
      res.json({ projectMeta: project, permission: share.permission });
    } catch (err) {
      next(err);
    }
  }
);
