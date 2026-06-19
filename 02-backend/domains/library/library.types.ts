// Per-slot material compatibility, stored inside the object and resolved client-side
// (Decision B). e.g. { id: 'body', label: 'Bathtub Body', allowedCategories: ['ceramic','stone'] }.
export interface MaterialSlot {
  id: string;
  label: string;
  allowedCategories: string[];
}

// Binding of a GLB mesh/material to a material slot.
export interface MaterialBinding {
  meshName: string;
  materialName: string;
  slotId: string;
}

// A library catalog object. Identity is the catalog slug (Decision A).
export interface LibraryObject {
  id: string; // catalog slug, e.g. 'bath-01'
  name: string;
  category: string; // category slug, e.g. 'bathroom'
  modelUrl: string;
  thumbnailUrl: string | null;
  topdownUrl: string | null;
  boundingBox: Record<string, unknown>; // { width, depth, height }
  collisionBox: Record<string, unknown>; // { width, depth }
  materialSlots: MaterialSlot[];
  materialBindings: MaterialBinding[];
  isPremium: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Full library object detail with resolved CDN URLs.
export type LibraryObjectDetail = LibraryObject;
