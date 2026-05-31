-- Migration 013: Performance indexes
-- Applies all indexes from DATABASE_ARCHITECTURE.md §5.
-- Depends on all prior migrations (all tables must exist).

-- ─── projects ───────────────────────────────────────────────
-- Hot path: list all projects for a user, excluding deleted
CREATE INDEX idx_projects_owner_active
  ON public.projects (owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Template browsing
CREATE INDEX idx_projects_templates
  ON public.projects (is_template, updated_at DESC)
  WHERE is_template = TRUE AND deleted_at IS NULL;

-- Public project browsing
CREATE INDEX idx_projects_public
  ON public.projects (is_public, updated_at DESC)
  WHERE is_public = TRUE AND deleted_at IS NULL;

-- GIN on scene_data for future JSON path queries
CREATE INDEX idx_projects_scene_gin
  ON public.projects USING GIN (scene_data jsonb_path_ops);


-- ─── library_objects ────────────────────────────────────────
-- Full-text search (generated column already STORED, just index it)
CREATE INDEX idx_library_objects_search
  ON public.library_objects USING GIN (search_vector);

-- Trigram index for partial / fuzzy name search ("arm" → "armchair")
CREATE INDEX idx_library_objects_name_trgm
  ON public.library_objects USING GIN (name gin_trgm_ops);

-- Category + active filter (library browse by category)
CREATE INDEX idx_library_objects_category_active
  ON public.library_objects (category_id, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- Placement surface filter (e.g. show only wall-attached objects)
CREATE INDEX idx_library_objects_placement
  ON public.library_objects (placement)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- Tag array search
CREATE INDEX idx_library_objects_tags
  ON public.library_objects USING GIN (tags);

-- Premium filter
CREATE INDEX idx_library_objects_premium
  ON public.library_objects (is_premium, category_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;


-- ─── materials ──────────────────────────────────────────────
CREATE INDEX idx_materials_search
  ON public.materials USING GIN (search_vector);

CREATE INDEX idx_materials_name_trgm
  ON public.materials USING GIN (name gin_trgm_ops);

CREATE INDEX idx_materials_category_active
  ON public.materials (category_id, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_materials_tags
  ON public.materials USING GIN (tags);


-- ─── project_objects ────────────────────────────────────────
-- Load all objects for a project (most frequent read)
CREATE INDEX idx_project_objects_project
  ON public.project_objects (project_id, floor_index);

-- Find all placements of a specific library object (analytics / delete cascade check)
CREATE INDEX idx_project_objects_library
  ON public.project_objects (library_object_id);

-- GIN on material_slots for future queries like
-- "find all project objects using material X"
CREATE INDEX idx_project_objects_material_slots_gin
  ON public.project_objects USING GIN (material_slots jsonb_path_ops);


-- ─── project_versions ───────────────────────────────────────
CREATE INDEX idx_project_versions_project
  ON public.project_versions (project_id, version_num DESC);


-- ─── project_autosaves ──────────────────────────────────────
CREATE INDEX idx_project_autosaves_project_time
  ON public.project_autosaves (project_id, saved_at DESC);


-- ─── project_shares ─────────────────────────────────────────
CREATE INDEX idx_project_shares_project
  ON public.project_shares (project_id);

CREATE INDEX idx_project_shares_token
  ON public.project_shares (token)
  WHERE token IS NOT NULL;

CREATE INDEX idx_project_shares_user
  ON public.project_shares (shared_with)
  WHERE shared_with IS NOT NULL;


-- ─── project_operations ─────────────────────────────────────
-- Replay ops for a project (CRDT catch-up)
CREATE INDEX idx_project_operations_project_time
  ON public.project_operations (project_id, applied_at);

-- Replay ops for a specific session
CREATE INDEX idx_project_operations_session
  ON public.project_operations (session_id, applied_at);


-- ─── category_material_compat ───────────────────────────────
-- "Given object_category_id, what material categories are allowed?"
-- Covered by PRIMARY KEY (object_category_id, material_category_id) — no extra index needed.
-- Reverse: given material_category_id, what object categories allow it?
CREATE INDEX idx_cat_mat_compat_reverse
  ON public.category_material_compat (material_category_id);


-- ─── object_categories ──────────────────────────────────────
CREATE INDEX idx_object_categories_parent
  ON public.object_categories (parent_id);

CREATE INDEX idx_object_categories_slug
  ON public.object_categories (slug);
