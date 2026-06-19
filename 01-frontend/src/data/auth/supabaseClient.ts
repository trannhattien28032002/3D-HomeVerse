/**
 * Supabase client singleton (A1).
 *
 * Dùng chung cho toàn app: auth (sign in/up/out, session) + JWT cho backend.
 * persistSession + autoRefreshToken bật để session sống qua reload và tự làm
 * mới access_token trước khi hết hạn — supabase-js lo phần refresh, FE chỉ
 * cần đọc session hiện tại khi cần token (xem src/data/api/client.ts).
 *
 * ⚠️ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY PHẢI trỏ đúng project Supabase
 * mà backend dùng để verify JWT (SUPABASE_JWT_SECRET), nếu không access_token
 * sinh ra ở FE sẽ không verify được ở BE.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env.local (see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
