-- Migration 006: Library objects catalog
-- Depends on: 005_object_categories.sql, 001_extensions_and_triggers.sql (pg_trgm, citext)

CREATE TYPE placement_surface AS ENUM (
  'floor',
  'wall',
  'ceiling',
  'wall_floor',
  'any'
);

CREATE TABLE public.library_objects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES public.object_categories(id),
  slug              CITEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  model_url         TEXT NOT NULL,
  thumbnail_url     TEXT NOT NULL,
  lod_urls          JSONB,
  placement         placement_surface NOT NULL DEFAULT 'floor',
  bounding_box      JSONB,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_premium        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector     TSVECTOR
);

CREATE OR REPLACE FUNCTION public.update_library_objects_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
  to_tsvector('english',
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_library_objects_search_vector
  BEFORE INSERT OR UPDATE ON public.library_objects
  FOR EACH ROW EXECUTE FUNCTION public.update_library_objects_search_vector();

CREATE TRIGGER trg_library_objects_updated_at
  BEFORE UPDATE ON public.library_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
