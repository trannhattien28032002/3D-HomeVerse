import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { RegisterSchema, UpdateProfileSchema } from './auth.schema';
import * as authService from './auth.service';

const router = Router();

// POST /auth/register — public, no Bearer token required.
// Creates a new Supabase Auth user and pre-seeds the public.profiles row.
// Returns { id, email, displayName } — no tokens (the client must call
// Supabase's signInWithPassword directly after registration).
router.post(
  '/register',
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.registerUser(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /auth/me
// Returns the authenticated user's profile. Upserts the profiles row on first call.
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getMe(req.user!.id, req.user!.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/me/profile
// Updates display_name and/or avatar_url. Body is validated by UpdateProfileSchema.
router.patch(
  '/me/profile',
  requireAuth,
  validate(UpdateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await authService.updateMe(req.user!.id, req.body as Record<string, unknown>);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export const authRouter = router;
