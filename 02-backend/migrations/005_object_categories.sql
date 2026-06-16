-- Migration 005: Object categories (tree structure)
-- Depends on: 001_extensions_and_triggers.sql (citext extension)

CREATE TABLE public.object_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID REFERENCES public.object_categories(id),
  slug          CITEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  icon_url      TEXT,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
