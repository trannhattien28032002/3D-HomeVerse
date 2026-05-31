import type { ZodIssue } from 'zod';
import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(issues: ZodIssue[]) {
    super('Validation failed', 422, 'VALIDATION_ERROR', issues);
  }
}
