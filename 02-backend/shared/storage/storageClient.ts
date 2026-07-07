import { storageAdmin, storageCdnBase } from '../../configs/storage';

// Public bucket hosting the static catalog assets (GLB / KTX2 / thumbnails / HDRI).
// Created by migration 016 and populated by 01-frontend/scripts/upload-catalog-assets.mjs;
// this is the bucket the frontend resolves to via VITE_ASSET_BASE_URL. The older
// `assets` bucket (backend scripts/upload-assets.ts) is superseded.
const CATALOG_BUCKET = 'catalog-assets';

// Resolves a storage-relative path to a fully-qualified public CDN URL.
// Path should be relative to the bucket root, e.g. "models/bathroom/bath-01.glb".
// Catalog paths carry a leading slash (e.g. "/models/...") — strip it so the URL
// is ".../public/catalog-assets/models/..." and not a 404-causing double slash.
export function resolvePublicUrl(filePath: string): string {
  const clean = filePath.replace(/^\/+/, '');
  return `${storageCdnBase}/storage/v1/object/public/${CATALOG_BUCKET}/${clean}`;
}

// Creates a time-limited signed URL for a private asset.
// expiresIn is the number of seconds until the URL expires.
export async function createSignedUrl(filePath: string, expiresIn: number): Promise<string> {
  const { data, error } = await storageAdmin
    .from('assets')
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL for "${filePath}": ${error?.message ?? 'unknown error'}`);
  }

  return data.signedUrl;
}
