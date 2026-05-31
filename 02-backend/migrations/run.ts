import { readdir, readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../configs/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppliedMigration {
  version: string;
  name: string;
  applied_at: Date;
  checksum: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Ensure the schema_migrations tracking table exists.
 * Uses IF NOT EXISTS so this is always safe to call.
 */
async function ensureSchemaMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      name        TEXT        NOT NULL,
      checksum    TEXT,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Load all previously applied migrations from the tracking table.
 * Returns a Map keyed by version string (e.g. "001").
 */
async function loadApplied(): Promise<Map<string, AppliedMigration>> {
  const result = await pool.query<AppliedMigration>(
    'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;'
  );
  const map = new Map<string, AppliedMigration>();
  for (const row of result.rows) {
    map.set(row.version, row);
  }
  return map;
}

/**
 * Derive the numeric version prefix from a filename like "001_foo_bar.sql".
 * Returns the leading digits (e.g. "001").
 */
function extractVersion(filename: string): string {
  const match = filename.match(/^(\d+)/);
  if (!match) {
    throw new Error(
      `Migration filename "${filename}" does not start with a numeric prefix.`
    );
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // run.ts lives inside migrations/, so __dirname IS the migrations directory.
  const migrationsDir = __dirname;

  // 1. Ensure the tracking table exists (idempotent DDL).
  await ensureSchemaMigrationsTable();

  // 2. Load already-applied migrations.
  const applied = await loadApplied();

  // 3. Discover .sql files in this directory, sorted lexicographically.
  //    Zero-padded numeric prefixes (001, 002, ...) guarantee correct order.
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log('[migrate] No SQL migration files found. Nothing to do.');
    return;
  }

  // 4. Separate pending files from already-applied ones.
  //    For applied files, verify checksum integrity and warn on drift.
  const pending: string[] = [];

  for (const filename of sqlFiles) {
    const version = extractVersion(filename);

    if (!applied.has(version)) {
      pending.push(filename);
      continue;
    }

    // Already applied — run checksum drift detection.
    const record = applied.get(version)!;
    if (record.checksum !== null) {
      const filePath = path.join(migrationsDir, filename);
      const content = await readFile(filePath, 'utf8');
      const currentChecksum = sha256(content);

      if (currentChecksum !== record.checksum) {
        console.warn(
          `[migrate] WARNING: checksum mismatch for already-applied migration "${filename}".` +
          `\n          Recorded : ${record.checksum}` +
          `\n          On disk  : ${currentChecksum}` +
          `\n          This file was modified after it was applied to the database.` +
          `\n          The migration will NOT be re-run automatically. Review the change carefully.`
        );
      }
    }
  }

  // 5. Short-circuit if nothing is pending.
  if (pending.length === 0) {
    console.log('[migrate] No pending migrations. Database is up to date.');
    return;
  }

  // 6. Apply each pending migration inside its own transaction.
  for (const filename of pending) {
    const version = extractVersion(filename);
    const filePath = path.join(migrationsDir, filename);

    let content: string;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (err) {
      console.error(
        `[migrate] ERROR: could not read file "${filename}": ${(err as Error).message}`
      );
      process.exit(1);
    }

    const checksum = sha256(content);
    const client = await pool.connect();

    process.stdout.write(`[migrate] applying ${filename} ... `);

    try {
      await client.query('BEGIN');

      // Run the full SQL file content.
      await client.query(content);

      // Record the migration in the tracking table.
      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum)
         VALUES ($1, $2, $3)
         ON CONFLICT (version) DO NOTHING;`,
        [version, filename, checksum]
      );

      await client.query('COMMIT');

      process.stdout.write('ok\n');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Swallow rollback errors — the original error takes priority.
      }

      process.stdout.write('FAILED\n');
      console.error(
        `[migrate] ERROR: migration "${filename}" failed and was rolled back.\n` +
        `         ${(err as Error).message}`
      );
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`[migrate] Done. Applied ${pending.length} migration(s).`);
}

main()
  .catch((err: unknown) => {
    console.error(
      '[migrate] Unexpected error:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  })
  .finally(() => {
    // Always drain the pool so the Node process exits cleanly.
    pool.end();
  });
