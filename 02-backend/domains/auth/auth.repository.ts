import { Pool, PoolClient } from 'pg';
import { typedQuery } from '../../shared/db/queryHelper';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import type { UserProfile, UpdateProfileInput } from './auth.types';

type Client = Pool | PoolClient;

// Raw row shape from pg before camelCase mapping. storage_used is a pg BIGINT,
// which node-postgres returns as a JS string. We normalise it to number here.
interface ProfileRow extends Omit<UserProfile, 'storageUsed'> {
  storageUsed: string | number;
}

function normalise(raw: ProfileRow): UserProfile {
  return {
    ...raw,
    storageUsed: Number(raw.storageUsed),
  };
}

// One round-trip upsert: the CTE inserts only when no row exists (no phantom write).
// If the INSERT fires, RETURNING * gives us the new row.
// If ON CONFLICT suppresses the INSERT, the UNION ALL branch reads the existing row.
// LIMIT 1 guards against an impossible double-return, ensuring a single row always.
const UPSERT_SQL = `
  WITH inserted AS (
    INSERT INTO public.profiles (id)
    VALUES ($1)
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  )
  SELECT * FROM inserted
  UNION ALL
  SELECT * FROM public.profiles
  WHERE id = $1
    AND NOT EXISTS (SELECT 1 FROM inserted)
  LIMIT 1
`;

export async function upsertProfile(client: Client, userId: string): Promise<UserProfile> {
  const { rows } = await typedQuery<ProfileRow>(client, UPSERT_SQL, [userId]);
  // rows[0] is always present: either the freshly inserted row or the pre-existing one.
  return normalise(rows[0]);
}

const SELECT_COLS = `
  id, display_name, avatar_url, plan, storage_used, created_at, updated_at
`;

export async function findProfileById(
  client: Client,
  userId: string
): Promise<UserProfile | null> {
  const { rows } = await typedQuery<ProfileRow>(
    client,
    `SELECT ${SELECT_COLS} FROM public.profiles WHERE id = $1`,
    [userId]
  );
  return rows[0] ? normalise(rows[0]) : null;
}

// Sets display_name during registration (single-column write, no full input object needed).
// Separate from updateProfile to avoid coupling the registration path to the PATCH schema.
export async function setDisplayName(
  client: Client,
  userId: string,
  displayName: string
): Promise<void> {
  await typedQuery<ProfileRow>(
    client,
    `UPDATE public.profiles SET display_name = $1 WHERE id = $2`,
    [displayName, userId]
  );
}

export async function updateProfile(
  client: Client,
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfile> {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined);

  // No fields provided — return the current row unchanged without a write.
  if (entries.length === 0) {
    const existing = await findProfileById(client, userId);
    if (!existing) {
      throw new NotFoundError('Profile not found');
    }
    return existing;
  }

  // Build a parameterised SET clause, mapping camelCase input keys to snake_case columns.
  const colMap: Record<string, string> = {
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of entries) {
    const col = colMap[key];
    if (!col) continue; // schema.strict() already rejected unknowns upstream
    values.push(value);
    setClauses.push(`${col} = $${values.length}`);
  }

  // userId goes in as the final parameter for the WHERE clause.
  values.push(userId);
  const whereParam = `$${values.length}`;

  const sql = `
    UPDATE public.profiles
    SET ${setClauses.join(', ')}
    WHERE id = ${whereParam}
    RETURNING ${SELECT_COLS}
  `;

  const { rows, rowCount } = await typedQuery<ProfileRow>(client, sql, values);

  if (rowCount === 0) {
    throw new NotFoundError('Profile not found');
  }

  return normalise(rows[0]);
}
