import type { RegisterSchema, UpdateProfileSchema } from './auth.schema';
import type { z } from 'zod';

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  storageUsed: number; // BIGINT returned as string by pg; converted to number in repository
  createdAt: Date;
  updatedAt: Date;
}

// MeResponse enriches the profile with email from the JWT (not stored in profiles table).
export type MeResponse = UserProfile & { email: string };

// Derived from the Zod schema to keep the source of truth in one place.
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ── Registration ────────────────────────────────────────────────────────────
export type RegisterInput = z.infer<typeof RegisterSchema>;

// Safe response — no password, no tokens, no sensitive auth metadata.
export interface RegisterResponse {
  id: string;
  email: string;
  displayName: string | null;
}
