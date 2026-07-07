-- Migration 018: Auto-create public.profiles on auth.users insert.
-- Depends on: 002_profiles.sql
--
-- Why: projects.owner_id (003) REFERENCES profiles.id, which REFERENCES
-- auth.users.id. A profiles row was previously created only by
--   (a) POST /auth/register (email/password), or
--   (b) the first GET /auth/me (lazy upsert).
-- Google / OAuth sign-in goes straight through Supabase and hits neither before
-- the user can create a project, so a brand-new OAuth user had no profiles row
-- and POST /projects failed with FK violation projects_owner_id_fkey.
--
-- This trigger makes profiles creation happen for EVERY auth method (email,
-- OAuth, magic link, …) at the source. It is the canonical Supabase pattern.
-- SECURITY DEFINER so it can write public.profiles from the auth.users context.
-- ON CONFLICT DO NOTHING keeps it idempotent and harmless alongside the existing
-- register/getMe upserts.
--
-- Note: fires only for NEW inserts. Pre-existing OAuth users with no profile are
-- backfilled by the next GET /auth/me (frontend now calls it on sign-in).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
