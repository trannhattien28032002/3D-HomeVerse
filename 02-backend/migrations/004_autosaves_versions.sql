-- Migration 004: project_autosaves and project_versions tables
-- Depends on: 003_projects.sql, 002_profiles.sql

CREATE TABLE public.project_autosaves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_data    JSONB NOT NULL,
  client_id     TEXT,
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.project_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_num   INTEGER NOT NULL,
  label         TEXT,
  scene_data    JSONB NOT NULL,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, version_num)
);

-- Auto-increment version_num per project
CREATE OR REPLACE FUNCTION next_project_version(p_project_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(MAX(version_num), 0) + 1
  FROM public.project_versions
  WHERE project_id = p_project_id;
$$ LANGUAGE sql;
