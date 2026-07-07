/**
 * Seed the catalog tables (`library_objects`, `materials`) from the frontend's
 * source-of-truth JSON files.
 *
 *   npm run db:seed
 *
 * Idempotent: every row is UPSERTed by its slug `id` (ON CONFLICT DO UPDATE), so
 * re-running re-syncs the catalog without creating duplicates. Catalog identity
 * is the slug (Decision A) — these same slugs are embedded inside scene_data, so
 * the script never rewrites or regenerates ids.
 *
 * JSONB note: node-pg coerces a JS array to a Postgres array literal, not JSON.
 * Every JSONB value is therefore JSON.stringify-ed and cast with ::jsonb.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import { pool } from '../configs/database';

// Frontend catalog lives outside the backend package.
const CATALOG_DIR = path.resolve(
  __dirname,
  '../../01-frontend/src/data/catalog'
);

// ---------------------------------------------------------------------------
// Source shapes (only the fields we persist)
// ---------------------------------------------------------------------------

interface SourceObject {
  id: string;
  name: string;
  category: string;
  modelUrl: string;
  thumbnailUrl?: string;
  topDown?: { imageUrl?: string };
  boundingBox?: unknown;
  collisionBox?: unknown;
  placement?: unknown;
  materialSlots?: unknown;
  materialBindings?: unknown;
  isPremium?: boolean;
}

interface SourceMaterial {
  id: string;
  name: string;
  category: string;
  icon?: string;
  textures?: unknown;
  isPremium?: boolean;
}

const json = (v: unknown): string => JSON.stringify(v ?? null);

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedObjects(): Promise<number> {
  const raw = await readFile(path.join(CATALOG_DIR, 'objects.json'), 'utf8');
  const objects = (JSON.parse(raw).objects ?? []) as SourceObject[];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const o of objects) {
      await client.query(
        `INSERT INTO public.library_objects
           (id, name, category, model_url, thumbnail_url, topdown_url,
            bounding_box, collision_box, placement, material_slots, material_bindings,
            is_premium, is_active)
         VALUES
           ($1, $2, $3, $4, $5, $6,
            $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
            $12, TRUE)
         ON CONFLICT (id) DO UPDATE SET
           name              = EXCLUDED.name,
           category          = EXCLUDED.category,
           model_url         = EXCLUDED.model_url,
           thumbnail_url     = EXCLUDED.thumbnail_url,
           topdown_url       = EXCLUDED.topdown_url,
           bounding_box      = EXCLUDED.bounding_box,
           collision_box     = EXCLUDED.collision_box,
           placement         = EXCLUDED.placement,
           material_slots    = EXCLUDED.material_slots,
           material_bindings = EXCLUDED.material_bindings,
           is_premium        = EXCLUDED.is_premium,
           is_active         = TRUE,
           deleted_at        = NULL`,
        [
          o.id,
          o.name,
          o.category,
          o.modelUrl,
          o.thumbnailUrl ?? null,
          o.topDown?.imageUrl ?? null,
          json(o.boundingBox ?? {}),
          json(o.collisionBox ?? {}),
          o.placement ? json(o.placement) : null,
          json(o.materialSlots ?? []),
          json(o.materialBindings ?? []),
          o.isPremium ?? false,
        ]
      );
    }
    await client.query('COMMIT');
    return objects.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function seedMaterials(): Promise<number> {
  const raw = await readFile(path.join(CATALOG_DIR, 'materials.json'), 'utf8');
  const materials = (JSON.parse(raw).materials ?? []) as SourceMaterial[];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of materials) {
      await client.query(
        `INSERT INTO public.materials
           (id, name, category, icon_url, textures, is_premium, is_active)
         VALUES
           ($1, $2, $3, $4, $5::jsonb, $6, TRUE)
         ON CONFLICT (id) DO UPDATE SET
           name       = EXCLUDED.name,
           category   = EXCLUDED.category,
           icon_url   = EXCLUDED.icon_url,
           textures   = EXCLUDED.textures,
           is_premium = EXCLUDED.is_premium,
           is_active  = TRUE,
           deleted_at = NULL`,
        [
          m.id,
          m.name,
          m.category,
          m.icon ?? null,
          json(m.textures ?? {}),
          m.isPremium ?? false,
        ]
      );
    }
    await client.query('COMMIT');
    return materials.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  process.stdout.write('[seed] seeding library_objects ... ');
  const nObjects = await seedObjects();
  process.stdout.write(`ok (${nObjects})\n`);

  process.stdout.write('[seed] seeding materials ... ');
  const nMaterials = await seedMaterials();
  process.stdout.write(`ok (${nMaterials})\n`);

  console.log('[seed] Done.');
}

main()
  .catch((err: unknown) => {
    console.error(
      '[seed] FAILED:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
