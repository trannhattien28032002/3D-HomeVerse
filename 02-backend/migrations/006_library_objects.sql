-- Migration 006: Library objects catalog (slug-keyed — Decision A)
-- Depends on: 001_extensions_and_triggers.sql (pg_trgm, set_updated_at)
--
-- Identity is the catalog slug (e.g. 'bath-01'), embedded directly in scene_data.
-- Category is a plain string slug (e.g. 'bathroom'), not a UUID tree (Decision B).
-- Per-slot material compatibility lives inside material_slots[].allowedCategories
-- and is resolved client-side — there are no compatibility tables.

CREATE TABLE public.library_objects (
  id                TEXT PRIMARY KEY,                         -- catalog slug, e.g. 'bath-01'
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,                            -- category slug, e.g. 'bathroom'
  model_url         TEXT NOT NULL,
  thumbnail_url     TEXT,
  topdown_url       TEXT,                                     -- topDown.imageUrl (2D plan view)
  bounding_box      JSONB NOT NULL DEFAULT '{}'::JSONB,       -- { width, depth, height }
  collision_box     JSONB NOT NULL DEFAULT '{}'::JSONB,       -- { width, depth }
  material_slots    JSONB NOT NULL DEFAULT '[]'::JSONB,       -- [{ id, label, allowedCategories[] }]
  material_bindings JSONB NOT NULL DEFAULT '[]'::JSONB,       -- [{ meshName, materialName, slotId }]
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

CREATE TRIGGER trg_library_objects_updated_at
  BEFORE UPDATE ON public.library_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
