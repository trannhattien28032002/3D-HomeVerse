// Must run before the pg Pool is created so the patched dns.lookup is in place
// for the first connection (some networks REFUSE *.pooler.supabase.com — see
// dns-fix.ts).
import './dns-fix';
import pg from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Single pg connection pool for the entire process.
// ssl rejectUnauthorized:false is required for Supabase's managed Postgres.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  // SSL is configured here, not via ?sslmode= in the URL, to avoid the
  // pg-connection-string warning about sslmode=require semantics changing in pg v9.
  // rejectUnauthorized:false is required because Supabase's cert is not in the
  // default Node.js CA bundle (set NODE_EXTRA_CA_CERTS to fix that properly).
  ssl: { rejectUnauthorized: false },
  // keepAlive improves stability on long-lived pooler connections.
  keepAlive: true,
});

// Service-role admin client — bypasses RLS.
// Used for server-side operations (JWT verification, admin mutations).
// Never expose this client or its key to the frontend.
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
