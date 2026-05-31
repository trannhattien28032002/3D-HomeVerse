-- Migration 003: Projects table
-- Depends on: 002_profiles.sql (profiles table for owner_id FK)

CREATE TABLE public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Untitled Project',
  thumbnail_url   TEXT,
  scene_data      JSONB NOT NULL DEFAULT '{}'::JSONB,
  floor_count     SMALLINT NOT NULL DEFAULT 1,
  is_template     BOOLEAN NOT NULL DEFAULT FALSE,
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
