import { supabaseAdmin } from './database';
import { env } from './env';

// Re-use the admin client's storage interface — no separate client needed.
export const storageAdmin = supabaseAdmin.storage;

// CDN base URL used to construct public asset URLs.
export const storageCdnBase: string = env.SUPABASE_STORAGE_CDN_URL;
