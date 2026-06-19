/**
 * Shared fixtures for DB-touching integration tests.
 *
 * These run against the configured Supabase dev DB (DATABASE_URL). The pool
 * connects as the `postgres`/Supavisor role, which bypasses RLS — so the
 * service layer (the real authz gate) is what's exercised, exactly as the plan
 * intends (RLS is defense-in-depth, not the gate).
 *
 * Test-user provisioning: `auth.users` only requires `id` (every other column
 * is nullable or defaulted), so we insert a bare row plus its `public.profiles`
 * row. `profiles.id` → `auth.users(id) ON DELETE CASCADE` and every owned
 * project/autosave/version/share cascades from `projects`, so cleanup is the
 * single `DELETE FROM auth.users` in deleteTestUser().
 */
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../../shared/db/client';
import { env } from '../../configs/env';

export interface TestUser {
  userId: string;
  token: string;
}

// Sign a Supabase-shaped HS256 JWT the auth middleware will accept.
export function signToken(userId: string, plan = 'free'): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@test.local`, app_metadata: { plan } },
    env.SUPABASE_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

// Provision an isolated test user (auth.users + profiles) and a signed token.
export async function createTestUser(): Promise<TestUser> {
  const userId = randomUUID();
  const email = `${userId}@test.local`;
  await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [userId, email]);
  // ON CONFLICT guards against any handle_new_user trigger that pre-creates the row.
  await pool.query(
    `INSERT INTO public.profiles (id, display_name) VALUES ($1, 'Integration Test')
     ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
  return { userId, token: signToken(userId) };
}

// Clean up the user and everything it owns. Projects are deleted first
// (cascades to autosaves/versions/shares) because `project_versions.created_by`
// and `project_shares.created_by` reference profiles WITHOUT ON DELETE CASCADE —
// so the profile can only be removed once those rows are gone. Deleting
// auth.users then cascades the profile row.
export async function deleteTestUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM public.projects WHERE owner_id = $1', [userId]);
  await pool.query('DELETE FROM auth.users WHERE id = $1', [userId]);
}

// A minimal valid scene blob — `version` is the only field the API validates
// (RQ-5 Option A / Decision B); everything else passes through verbatim.
export function makeScene(
  extra: Record<string, unknown> = {}
): { version: number } & Record<string, unknown> {
  return { version: 1, ...extra };
}
