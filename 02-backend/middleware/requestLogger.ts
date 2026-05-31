import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

const httpLogger = pinoHttp({
  // Attach correlation ID to every log record and response header.
  genReqId(req: Request, res: Response): string {
    const existing = req.headers['x-correlation-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader('x-correlation-id', id);
    return id;
  },
  // Do not log the health endpoint to avoid noise.
  autoLogging: {
    ignore(req: Request): boolean {
      return req.url === '/health';
    },
  },
});

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  httpLogger(req, res, next);
}
