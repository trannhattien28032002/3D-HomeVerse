import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

import http from 'http';
import pino from 'pino';
import { createApp } from './app';
import { env } from './configs/env';
import { pool } from './shared/db/client';
import { warmupCompatibilityCache } from './domains/materials/materials.service';

const logger = pino({ name: 'server' });

const app = createApp();
const server = http.createServer(app);

/**
 * Quick connectivity check — runs a single SELECT 1 against the pool.
 * Returns true if the pool can reach the database, false otherwise.
 * Never throws; all errors are logged with an actionable message.
 */
async function pingDatabase(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    logger.info('Database ping succeeded — pool is healthy');
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isNameResolution =
      message.includes('ENOTFOUND') || message.includes('getaddrinfo');

    if (isNameResolution) {
      logger.error(
        { err },
        'Database ping failed: hostname not found. ' +
        'The deprecated direct Supabase host (db.<project>.supabase.co) no longer has a DNS record. ' +
        'Update DATABASE_URL in properties.dev.env to the Supabase Pooler URL — ' +
        'see the comments in that file for the exact format.'
      );
    } else {
      logger.error(
        { err },
        'Database ping failed — DB is unreachable. ' +
        'Check DATABASE_URL in properties.dev.env and ensure the Supabase project is not paused.'
      );
    }

    return false;
  }
}

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening');

  // Verify DB connectivity on startup, then warm up the in-memory cache.
  // Both operations are fire-and-forget: a failure logs a clear, actionable
  // error but does not crash the process (so /health remains reachable).
  void pingDatabase().then((ok) => {
    if (ok) {
      void warmupCompatibilityCache();
    }
  });
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — draining connections');
  server.close(async () => {
    try {
      await pool.end();
      logger.info('pg pool closed — exiting');
    } catch (err) {
      logger.error({ err }, 'Error closing pg pool');
    } finally {
      process.exit(0);
    }
  });

  // Force exit if graceful shutdown takes too long.
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
