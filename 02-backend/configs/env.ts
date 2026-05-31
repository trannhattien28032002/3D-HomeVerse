import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load env file before schema parse so the vars are in process.env
dotenv.config({ path: path.resolve(__dirname, '../properties.dev.env') });
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  SUPABASE_STORAGE_CDN_URL: z.string().url(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  process.stderr.write(
    `[env] Startup aborted — missing or invalid environment variables:\n${issues}\n`
  );
  process.exit(1);
}

export const env = result.data;
