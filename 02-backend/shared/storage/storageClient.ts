import { storageAdmin, storageCdnBase } from '../../configs/storage';

// Resolves a storage-relative path to a fully-qualified public CDN URL.
// Path should be relative to the bucket root, e.g. "furniture/chair.glb".
export function resolvePublicUrl(filePath: string): string {
  return `${storageCdnBase}/storage/v1/object/public/assets/${filePath}`;
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
