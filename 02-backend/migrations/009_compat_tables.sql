-- Migration 009: Compatibility tables and function
-- Depends on: 005_object_categories.sql, 006_library_objects.sql, 007_material_categories.sql

CREATE TABLE public.category_material_compat (
  object_category_id    UUID NOT NULL REFERENCES public.object_categories(id) ON DELETE CASCADE,
  material_category_id  UUID NOT NULL REFERENCES public.material_categories(id) ON DELETE CASCADE,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (object_category_id, material_category_id)
);

CREATE TABLE public.object_material_compat_override (
  library_object_id     UUID NOT NULL REFERENCES public.library_objects(id) ON DELETE CASCADE,
  material_category_id  UUID NOT NULL REFERENCES public.material_categories(id) ON DELETE CASCADE,
  allow                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (library_object_id, material_category_id)
);

-- SQL function wrapping the category matrix + per-object override CTE query.
-- Returns all valid material categories for a given library object.
CREATE OR REPLACE FUNCTION public.compatible_material_categories(p_object_id UUID)
RETURNS TABLE (id UUID, slug CITEXT, name TEXT) AS $$
  WITH base_compat AS (
    SELECT cmc.material_category_id, TRUE AS allowed
    FROM public.library_objects lo
    JOIN public.category_material_compat cmc
      ON cmc.object_category_id = lo.category_id
    WHERE lo.id = p_object_id
  ),
  overrides AS (
    SELECT omco.material_category_id, omco.allow
    FROM public.object_material_compat_override omco
    WHERE omco.library_object_id = p_object_id
  ),
  merged AS (
    SELECT
      COALESCE(o.material_category_id, b.material_category_id) AS material_category_id,
      COALESCE(o.allow, b.allowed) AS allowed
    FROM base_compat b
    FULL OUTER JOIN overrides o
      ON o.material_category_id = b.material_category_id
  )
  SELECT mc.id, mc.slug, mc.name
  FROM merged m
  JOIN public.material_categories mc ON mc.id = m.material_category_id
  WHERE m.allowed = TRUE;
$$ LANGUAGE sql STABLE;
