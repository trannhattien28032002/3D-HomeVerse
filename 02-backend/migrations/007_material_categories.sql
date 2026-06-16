-- Migration 007: Material categories
-- Depends on: 001_extensions_and_triggers.sql (citext extension)

CREATE TABLE public.material_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        CITEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
