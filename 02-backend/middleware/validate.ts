import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors/ValidationError';

type RequestTarget = 'body' | 'query' | 'params';

// Factory that returns middleware validating req[target] against the given Zod schema.
// On success the validated (and coerced) value replaces the raw req[target].
// On failure throws a ValidationError carrying the Zod issue list.
export function validate(schema: ZodSchema, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      throw new ValidationError(result.error.issues);
    }
    // Replace raw input with the parsed (and possibly coerced) value.
    // In Express 5 `req.query` is a getter-only property, so a plain
    // assignment throws "Cannot set property query ... which has only a
    // getter". Redefine it as a data property instead. `body`/`params`
    // remain writable, so a direct assignment is fine for those.
    if (target === 'query') {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      (req as unknown as Record<string, unknown>)[target] = result.data;
    }
    next();
  };
}
