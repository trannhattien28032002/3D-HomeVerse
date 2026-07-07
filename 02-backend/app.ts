import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './configs/env';
import { requestLogger } from './middleware/requestLogger';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { NotFoundError } from './shared/errors/NotFoundError';
import { authRouter } from './domains/auth/auth.routes';
import { projectsRouter } from './domains/projects/projects.routes';
import { scenesRouter } from './domains/scenes/scenes.routes';
import { autosaveRouter } from './domains/autosave/autosave.routes';
import { versionsRouter } from './domains/versions/version.routes';
import { libraryRouter } from './domains/library/library.routes';
import { materialsRouter } from './domains/materials/materials.routes';
import { sharingRouter, publicShareRouter } from './domains/sharing/sharing.routes';
import { aiRouter } from './domains/ai/ai.routes';
import { getOpenApiSpec } from './shared/openapi/openapi';

/**
 * Parses `ALLOWED_ORIGINS` (comma-separated) into a CORS origin allowlist for production.
 * Returns `false` (block all cross-origin requests) if unset/empty — safe default that
 * avoids silently opening CORS wide open, with a boot-time warning so misconfiguration
 * is visible rather than a silent 403 surprise in the field.
 */
function getProductionAllowedOrigins(): string[] | false {
  const raw = env.ALLOWED_ORIGINS ?? '';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    console.warn(
      '[cors] ALLOWED_ORIGINS not set (or empty) in production — blocking all cross-origin requests. ' +
        'Set ALLOWED_ORIGINS="https://app.example.com,https://www.example.com" to allow specific origins.'
    );
    return false;
  }

  return origins;
}

export function createApp(): express.Express {
  const app = express();
  console.log('DATABASE_URL:', env.DATABASE_URL);

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── Response compression (gzip/brotli via Accept-Encoding) ────────────────
  app.use(compression());

  // ── CORS ───────────────────────────────────────────────────────────────────
  // In production, restrict origins via ALLOWED_ORIGINS env (comma-separated list);
  // in development allow all.
  const corsOptions: cors.CorsOptions =
    env.NODE_ENV === 'production' ? { origin: getProductionAllowedOrigins() } : { origin: true };
  app.use(cors(corsOptions));

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Public routes ──────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/docs/openapi.json', (_req: Request, res: Response) => {
    res.json(getOpenApiSpec());
  });

  // ── Protected test route (Phase 0 acceptance check) ───────────────────────
  // Confirms that requireAuth is wired: any unauthenticated request to a
  // protected path receives 401. Domain routers will be mounted here in Phase 1+.
  app.get('/me/ping', requireAuth, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // ── Domain routers ─────────────────────────────────────────────────────────
  // Auth applies requireAuth per-route (not at mount) so future public sub-paths
  // (e.g. public profile lookup) can be added without restructuring.
  app.use('/auth', authRouter);
  app.use('/projects', projectsRouter);
  // Scenes routes use /:id/scene pattern — mount at /projects so params merge.
  app.use('/projects', scenesRouter);
  app.use('/projects', autosaveRouter);
  app.use('/projects', versionsRouter);
  app.use('/library', libraryRouter);
  app.use('/materials', materialsRouter);
  // Sharing management routes (under /projects/:id/share).
  app.use('/projects', sharingRouter);
  // Public share token resolution (no auth required).
  app.use('/share', publicShareRouter);
  // AI chat (WP1b) — dev-only proxy giữ GEMINI_API_KEY server-side.
  app.use('/ai', aiRouter);

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route not found'));
  });

  // ── Central error handler — must be last ───────────────────────────────────
  app.use(errorHandler);

  return app;
}
