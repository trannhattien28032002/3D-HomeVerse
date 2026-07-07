import { z } from 'zod';

// ── Registration ────────────────────────────────────────────────────────────
// Password rules: min 8 chars, at least one uppercase letter, one digit, and
// one special character. Mirrors common Supabase password policy defaults.
export const RegisterSchema = z
  .object({
    email: z.string().email('Must be a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one digit')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    displayName: z.string().min(1).max(120).optional(),
  })
  .strict();

// ── Profile update ──────────────────────────────────────────────────────────
export const UpdateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict(); // reject unknown keys — prevents clients from smuggling plan escalations
