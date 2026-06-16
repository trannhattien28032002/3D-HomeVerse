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
    // Double-cast required because TypeScript's Request type lacks an index signature.
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
