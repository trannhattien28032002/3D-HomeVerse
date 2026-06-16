import { pool } from '../../shared/db/client';
import { supabaseAdmin } from '../../configs/database';
import { upsertProfile, updateProfile, setDisplayName } from './auth.repository';
import { ConflictError } from '../../shared/errors/ConflictError';
import { AppError } from '../../shared/errors/AppError';
import type { UserProfile, MeResponse, UpdateProfileInput, RegisterInput, RegisterResponse } from './auth.types';

// Ensures a profiles row exists for the given Supabase user.
// Exported for testability and future webhook-driven profile creation.
export async function syncProfile(userId: string): Promise<UserProfile> {
  return upsertProfile(pool, userId);
}

// Returns the authenticated user's profile, upserted on first call.
// Email is injected from the JWT — it is not stored in the profiles table.
export async function getMe(userId: string, email: string): Promise<MeResponse> {
  const profile = await syncProfile(userId);
  return { ...profile, email };
}

// Updates mutable profile fields and returns the updated profile (without email,
// per the PATCH /auth/me/profile contract which returns the profile object only).
export async function updateMe(
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfile> {
  return updateProfile(pool, userId, input);
}

// ── Registration ────────────────────────────────────────────────────────────
// Creates a new Supabase Auth user via the Admin API (service role), then
// pre-creates the public.profiles row (with optional displayName).
// email_confirm:true lets the user sign in immediately without verifying email.
// Returns only safe, non-sensitive fields.
export async function registerUser(input: RegisterInput): Promise<RegisterResponse> {
  const { email, password, displayName } = input;

  // 1. Create the auth.users row via Supabase Admin API.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : {},
  });

  if (error) {
    // Supabase signals duplicate email with a specific message fragment.
    // We normalise this to 409 Conflict so the client can show a proper message.
    const msg = error.message ?? '';
    if (
      msg.toLowerCase().includes('already registered') ||
      msg.toLowerCase().includes('already been registered') ||
      msg.toLowerCase().includes('user already exists') ||
      error.code === 'email_exists'
    ) {
      throw new ConflictError('An account with this email address already exists');
    }
    // Any other Supabase error is an upstream failure — surface as 502.
    throw new AppError(
      `Registration failed: ${msg}`,
      502,
      'UPSTREAM_ERROR'
    );
  }

  if (!data.user) {
    throw new AppError('Registration failed: no user returned', 502, 'UPSTREAM_ERROR');
  }

  const userId = data.user.id;

  // 2. Upsert the public.profiles row. This is safe to call even if a
  //    database trigger already created the row (the CTE uses ON CONFLICT DO NOTHING).
  const profile = await upsertProfile(pool, userId);

  // 3. If a displayName was supplied, write it to the profile row immediately
  //    so GET /auth/me returns it on the first call without a second PATCH round-trip.
  if (displayName) {
    await setDisplayName(pool, userId, displayName);
  }

  return {
    id: userId,
    email: data.user.email ?? email,
    displayName: displayName ?? profile.displayName,
  };
}
