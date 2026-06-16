export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  iconUrl: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
}

export interface LibraryObject {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  modelUrl: string;
  thumbnailUrl: string;
  lodUrls: Record<string, string> | null;
  placement: 'floor' | 'wall' | 'ceiling' | 'wall_floor' | 'any';
  boundingBox: Record<string, unknown> | null;
  tags: string[];
  metadata: Record<string, unknown>;
  isPremium: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Full library object detail with resolved CDN URLs.
export type LibraryObjectDetail = LibraryObject;
