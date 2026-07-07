-- Migration 017: Wall-placement spec for library objects.
-- Depends on: 006_library_objects.sql
--
-- The catalog ships placement metadata for wall-mounted / opening items (doors,
-- windows, wall shelves, mirrors, switches, radiators, vents, …). It was previously
-- bundled only in the frontend objects.json. As the catalog moves to be DB-sourced,
-- this column makes library_objects the single source of truth so the engine can
-- keep enforcing wall-constraint / cut-opening behavior.
--
-- Shape (jsonb), null for floor items (the default):
--   { "constraint":"wall",
--     "wallBehavior":"mount"|"opening",
--     "mountHeight":1.3, "faceGap":0,                 -- mount
--     "cut":{"width":0.9,"height":2.05,"sill":0}, "embed":"center" }  -- opening

ALTER TABLE public.library_objects
  ADD COLUMN IF NOT EXISTS placement jsonb;

-- ─── Seed placement for the 19 wall-constrained catalog items ────────────────
-- Values mirror 01-frontend/src/data/catalog/objects.json (placement blocks).
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":0.9,"height":2.05,"sill":0},"embed":"center"}'::jsonb WHERE id = 'door-a';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":0.9,"height":2.05,"sill":0},"embed":"center"}'::jsonb WHERE id = 'door-b';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":0.94,"height":2.15,"sill":0},"embed":"center"}'::jsonb WHERE id = 'door-c';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":0.68,"height":1.39,"sill":0.9},"embed":"center"}'::jsonb WHERE id = 'window-a';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":1.15,"height":1.51,"sill":0.9},"embed":"center"}'::jsonb WHERE id = 'window-b';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"opening","cut":{"width":0.91,"height":0.92,"sill":0.9},"embed":"center"}'::jsonb WHERE id = 'window-c';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.3,"faceGap":0}'::jsonb WHERE id = 'wall-shelf-a';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.3,"faceGap":0}'::jsonb WHERE id = 'wall-shelf-b';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":0.7,"faceGap":0}'::jsonb WHERE id = 'toilet-roll-holder-01';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.1,"faceGap":0}'::jsonb WHERE id = 'towel-holder-01';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.6,"faceGap":0}'::jsonb WHERE id = 'clock';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1,"faceGap":0}'::jsonb WHERE id = 'curtains';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.1,"faceGap":0}'::jsonb WHERE id = 'light-switch';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1,"faceGap":0}'::jsonb WHERE id = 'mirror-a';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":1.2,"faceGap":0}'::jsonb WHERE id = 'mirror-b';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":0.15,"faceGap":0}'::jsonb WHERE id = 'radiator-large';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":0.15,"faceGap":0}'::jsonb WHERE id = 'radiator-small';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":0.3,"faceGap":0}'::jsonb WHERE id = 'socket';
UPDATE public.library_objects SET placement = '{"constraint":"wall","wallBehavior":"mount","mountHeight":2,"faceGap":0}'::jsonb WHERE id = 'vent';
