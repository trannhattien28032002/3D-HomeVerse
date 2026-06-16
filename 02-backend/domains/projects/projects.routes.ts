import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
} from './projects.schema';
import * as service from './projects.service';

export const projectsRouter = Router();

// GET /projects — list caller's non-deleted projects (cursor-paginated).
projectsRouter.get(
  '/',
  requireAuth,
  validate(ListProjectsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as { cursor?: string; limit: number; sort: 'updatedAt' | 'createdAt' | 'name' };
      const result = await service.listProjects(userId, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects — create a new project.
projectsRouter.post(
  '/',
  requireAuth,
  validate(CreateProjectSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await service.createProject(req.user!.id, req.body);
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }
);

// GET /projects/:id — get single project metadata.
projectsRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await service.getProject(req.user!.id, String(req.params.id), req.shareContext);
      res.json(project);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /projects/:id — update project metadata.
projectsRouter.patch(
  '/:id',
  requireAuth,
  validate(UpdateProjectSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await service.updateProject(req.user!.id, String(req.params.id), req.body);
      res.json(project);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id — soft-delete a project.
projectsRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await service.deleteProject(req.user!.id, String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/restore — un-delete a soft-deleted project.
projectsRouter.post(
  '/:id/restore',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const project = await service.restoreProject(req.user!.id, String(req.params.id));
      res.json(project);
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/duplicate — atomic copy of project row + project_objects.
projectsRouter.post(
  '/:id/duplicate',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.duplicateProject(req.user!.id, String(req.params.id));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);
