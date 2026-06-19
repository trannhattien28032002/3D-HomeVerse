// KTX2 texture map paths (Decision A). All optional — a material may omit maps.
export interface MaterialTextures {
  color?: string;
  normal?: string;
  roughness?: string;
  ao?: string;
}

// A material catalog entry. Identity is the catalog slug (Decision A).
export interface Material {
  id: string; // catalog slug, e.g. 'Asphalt031'
  name: string;
  category: string; // category slug, e.g. 'ground'
  iconUrl: string | null;
  textures: MaterialTextures;
  isPremium: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
