-- Migration 010: project_objects (placed object instances)
-- Depends on: 003_projects.sql, 006_library_objects.sql

CREATE TABLE public.project_objects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  library_object_id UUID NOT NULL REFERENCES public.library_objects(id),
  transform         JSONB NOT NULL DEFAULT '{}'::JSONB,
  floor_index       SMALLINT NOT NULL DEFAULT 0,
  material_slots    JSONB NOT NULL DEFAULT '{}'::JSONB,
  instance_props    JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_project_objects_updated_at
  BEFORE UPDATE ON public.project_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
