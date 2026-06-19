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

-- Category slug + active filter (library browse by category)
CREATE INDEX idx_library_objects_category_active
  ON public.library_objects (category, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- Premium filter
CREATE INDEX idx_library_objects_premium
  ON public.library_objects (is_premium, category)
  WHERE is_active = TRUE AND deleted_at IS NULL;


-- ─── materials ──────────────────────────────────────────────
CREATE INDEX idx_materials_search
  ON public.materials USING GIN (search_vector);

CREATE INDEX idx_materials_name_trgm
  ON public.materials USING GIN (name gin_trgm_ops);

CREATE INDEX idx_materials_category_active
  ON public.materials (category, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;


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

-- No compatibility or object_categories indexes — those tables were removed (Decision B).
