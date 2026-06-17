-- Migration 008: Materials catalog (slug-keyed — Decision A)
-- Depends on: 001_extensions_and_triggers.sql (pg_trgm, set_updated_at)
--
-- Identity is the catalog slug (e.g. 'Asphalt031'), embedded directly in scene_data
-- (SceneFurnitureRecord materials map). Category is a plain string slug (e.g. 'ground').
-- Texture maps (KTX2 paths) are stored as a single JSONB object.

CREATE TABLE public.materials (
  id                TEXT PRIMARY KEY,                    -- catalog slug, e.g. 'Asphalt031'
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,                       -- category slug, e.g. 'ground'
  icon_url          TEXT,                                -- icon (thumbnail webp)
  textures          JSONB NOT NULL DEFAULT '{}'::JSONB,  -- { color, normal, roughness, ao } KTX2 paths
  is_premium        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector     TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(name, '') || ' ' || COALESCE(category, '')
    )
  ) STORED
);

CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
