import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import pino from 'pino';
import { AppError } from '../shared/errors/AppError';
import { ValidationError } from '../shared/errors/ValidationError';
import { env } from '../configs/env';

const logger = pino({ name: 'errorHandler' });

// Express error-handling middleware — must be registered last.
// Normalises all thrown errors into the canonical envelope:
// { error: { code, message, details? } }
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // next must be declared even if unused — Express requires 4-parameter signature.
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    res.status(err.statusCode).json({ error: body });
    return;
  }

  if (err instanceof ZodError) {
    const ve = new ValidationError(err.issues);
    res.status(ve.statusCode).json({
      error: {
        code: ve.code,
        message: ve.message,
        details: ve.details,
      },
    });
    return;
  }

  // Unknown error — log full details; hide internals from clients in production.
  logger.error({ err }, 'Unhandled error');
  const message = env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
