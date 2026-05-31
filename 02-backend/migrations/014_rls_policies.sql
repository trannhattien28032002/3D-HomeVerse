-- Migration 014: Row Level Security — enable RLS and create all policies.
-- Applies to all user-data tables. Library/catalog tables are public-read.
-- Depends on all prior migrations.

-- ─── Enable RLS on all tables ───────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_autosaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_material_compat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_material_compat_override ENABLE ROW LEVEL SECURITY;

-- ─── profiles ───────────────────────────────────────────────────────────────
CREATE POLICY "profiles: users can view their own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ─── projects ───────────────────────────────────────────────────────────────
-- Owner has full access
CREATE POLICY "projects: owner full access"
  ON public.projects FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Shared users can select (viewer/commenter/editor)
CREATE POLICY "projects: shared users can read"
  ON public.projects FOR SELECT
  USING (
    is_public = TRUE
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = id
        AND (
          ps.shared_with = auth.uid()
          OR ps.token IS NOT NULL  -- link share; token validated in API layer
        )
        AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
    )
  );

-- Shared editors can update
CREATE POLICY "projects: editors can update"
  ON public.projects FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.project_id = id
        AND ps.shared_with = auth.uid()
        AND ps.permission = 'editor'
        AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
    )
  );

-- Soft-delete: only owner can delete
CREATE POLICY "projects: owner can delete"
  ON public.projects FOR DELETE
  USING (owner_id = auth.uid());

-- ─── project_objects ────────────────────────────────────────────────────────
-- Access mirrors the parent project's access
CREATE POLICY "project_objects: access via project ownership"
  ON public.project_objects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

-- Shared viewers and editors can read
CREATE POLICY "project_objects: shared read"
  ON public.project_objects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      LEFT JOIN public.project_shares ps ON ps.project_id = p.id
      WHERE p.id = project_id
        AND (
          p.is_public = TRUE
          OR p.owner_id = auth.uid()
          OR (ps.shared_with = auth.uid()
              AND (ps.expires_at IS NULL OR ps.expires_at > NOW()))
        )
    )
  );

-- ─── Library tables (public read, admin write) ──────────────────────────────
-- Library objects are public to any authenticated user
CREATE POLICY "library_objects: authenticated users can read"
  ON public.library_objects FOR SELECT
  TO authenticated
  USING (is_active = TRUE AND deleted_at IS NULL);

-- Only service_role (backend) can insert/update/delete
-- (No INSERT/UPDATE/DELETE policy for normal users — default-deny handles it)

CREATE POLICY "materials: authenticated users can read"
  ON public.materials FOR SELECT
  TO authenticated
  USING (is_active = TRUE AND deleted_at IS NULL);

CREATE POLICY "object_categories: authenticated users can read"
  ON public.object_categories FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "material_categories: authenticated users can read"
  ON public.material_categories FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "category_material_compat: authenticated users can read"
  ON public.category_material_compat FOR SELECT
  TO authenticated
  USING (TRUE);

-- ─── project_shares ─────────────────────────────────────────────────────────
-- Owner can manage shares
CREATE POLICY "project_shares: owner can manage"
  ON public.project_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

-- Shared users can see their own share rows
CREATE POLICY "project_shares: shared users can see their entry"
  ON public.project_shares FOR SELECT
  USING (shared_with = auth.uid());
