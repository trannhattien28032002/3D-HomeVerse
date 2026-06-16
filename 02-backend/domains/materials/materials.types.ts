export interface MaterialCategory {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

export interface Material {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  albedoUrl: string | null;
  normalUrl: string | null;
  roughnessUrl: string | null;
  metalnessUrl: string | null;
  aoUrl: string | null;
  thumbnailUrl: string;
  pbrDefaults: Record<string, unknown>;
  tags: string[];
  isPremium: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory compatibility matrix:
// object_category_id → Set of allowed material_category_ids
// Also stores per-object overrides keyed by library_object_id.
export interface CompatMatrixEntry {
  objectCategoryId: string;
  materialCategoryId: string;
}

export interface CompatOverrideEntry {
  libraryObjectId: string;
  materialCategoryId: string;
  allow: boolean;
}
