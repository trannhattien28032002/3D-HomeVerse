// Full project row with all columns (camelCase).
export interface Project {
  id: string;
  ownerId: string;
  name: string;
  thumbnailUrl: string | null;
  sceneData: Record<string, unknown>;
  floorCount: number;
  isTemplate: boolean;
  isPublic: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Project metadata without the large sceneData blob.
export interface ProjectMeta {
  id: string;
  ownerId: string;
  name: string;
  thumbnailUrl: string | null;
  floorCount: number;
  isTemplate: boolean;
  isPublic: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Opaque cursor shape encoded as base64.
export interface ListProjectsCursor {
  updatedAt: string; // ISO
  id: string;        // uuid
}

export interface CreateProjectInput {
  name?: string;
  floorCount?: number;
}

export interface UpdateProjectMetaInput {
  name?: string;
  thumbnailUrl?: string;
  isTemplate?: boolean;
  isPublic?: boolean;
}
