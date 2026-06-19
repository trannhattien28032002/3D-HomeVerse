-- Migration 015: Storage bucket + RLS for user-uploaded project thumbnails.
-- Creates a PUBLIC bucket `project-thumbnails` and policies on storage.objects
-- so an authenticated user can upload/replace/delete files only inside their own
-- top-level folder, keyed by their auth.uid(). Path convention:
--   {userId}/{projectId}        e.g. "a1b2.../c3d4...".
-- Public read so the CDN public URL can be used as projects.thumbnail_url
-- (set via PATCH /projects/:id). Depends on the Supabase `storage` schema.

-- ─── Bucket ─────────────────────────────────────────────────────────────────
-- public = TRUE → files are served via the public CDN object endpoint, which is
-- what resolves to projects.thumbnail_url. Idempotent via ON CONFLICT.
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-thumbnails', 'project-thumbnails', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── storage.objects policies (scoped to this bucket) ───────────────────────
-- The first path segment must equal the caller's uid, so a user can only write
-- under their own folder: (storage.foldername(name))[1] = auth.uid()::text.

-- Public read — needed so the public CDN URL serves the thumbnail to anyone.
CREATE POLICY "project-thumbnails: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'project-thumbnails');

-- Authenticated users can upload into their own folder.
CREATE POLICY "project-thumbnails: owner can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can overwrite (upsert) their own files.
CREATE POLICY "project-thumbnails: owner can update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own files.
CREATE POLICY "project-thumbnails: owner can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
