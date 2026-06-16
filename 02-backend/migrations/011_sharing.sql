-- Migration 011: Project sharing
-- Depends on: 003_projects.sql, 002_profiles.sql

CREATE TYPE share_permission AS ENUM ('viewer', 'commenter', 'editor');

CREATE TABLE public.project_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shared_with   UUID REFERENCES public.profiles(id),
  permission    share_permission NOT NULL DEFAULT 'viewer',
  token         TEXT UNIQUE,
  expires_at    TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
