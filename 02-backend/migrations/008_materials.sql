-- Migration 008: Materials catalog
-- Depends on: 007_material_categories.sql, 001_extensions_and_triggers.sql (pg_trgm, citext)

CREATE TABLE public.materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES public.material_categories(id),
  slug              CITEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  albedo_url        TEXT,
  normal_url        TEXT,
  roughness_url     TEXT,
  metalness_url     TEXT,
  ao_url            TEXT,
  thumbnail_url     TEXT NOT NULL,
  pbr_defaults      JSONB NOT NULL DEFAULT '{}'::JSONB,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  is_premium        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  search_vector     TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(name, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(array_to_string(tags, ' '), '')
    )
  ) STORED
);

CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
