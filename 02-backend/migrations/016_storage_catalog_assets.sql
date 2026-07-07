-- Migration 016: Storage bucket + RLS for the static catalog assets.
-- Creates a PUBLIC bucket `catalog-assets` that hosts the content previously
-- bundled in 01-frontend/public/: GLB models, KTX2 textures, thumbnails, HDRI.
-- Path convention mirrors the old folder layout (no leading slash):
--   models/<cat>/<file>.glb, materials/<set>/<file>.ktx2,
--   thumbnails/<cat>/<file>.webp, hdri/studio.hdr
-- The frontend resolves these via VITE_ASSET_BASE_URL ->
--   {SUPABASE_URL}/storage/v1/object/public/catalog-assets
-- (see 01-frontend/src/data/catalog/assetUrl.ts).
--
-- Uploads are done out-of-band by an operator running
-- 01-frontend/scripts/upload-catalog-assets.mjs with the service_role key,
-- which BYPASSES RLS — so we only need a public-read policy here. We do NOT
-- grant write to `authenticated`: catalog assets are app-managed, not user data.
-- Depends on the Supabase `storage` schema.

-- ─── Bucket ─────────────────────────────────────────────────────────────────
-- public = TRUE → files are served via the public CDN object endpoint, which is
-- what VITE_ASSET_BASE_URL points at. Idempotent via ON CONFLICT.
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-assets', 'catalog-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── storage.objects policy (scoped to this bucket) ─────────────────────────
-- Public read only — needed so the public CDN URL serves assets to anyone.
-- Writes intentionally have no policy: only the service_role (which bypasses
-- RLS) may upload, via the upload script.
CREATE POLICY "catalog-assets: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'catalog-assets');
