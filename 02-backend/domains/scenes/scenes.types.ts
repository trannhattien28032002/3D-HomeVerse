// Typed scene data shape. The `version` field is required; all other fields pass through.
export interface SceneData {
  version: number;
  [key: string]: unknown;
}

// A placed instance of a library object inside a project (camelCase).
export interface ProjectObject {
  id: string;
  projectId: string;
  libraryObjectId: string;
  transform: Record<string, unknown>;
  floorIndex: number;
  materialSlots: Record<string, unknown>;
  instanceProps: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  // Resolved CDN URL (not stored in DB — injected at service layer).
  modelUrl?: string;
}

// Response shape for GET /projects/:id/scene.
export interface LoadSceneResponse {
  sceneData: SceneData;
  objects: ProjectObject[];
}

// Request body for PUT /projects/:id/scene.
export interface SaveSceneBody {
  sceneData: SceneData;
  objects: ProjectObjectInput[];
}

// Input shape for objects in a save request (id is optional for new objects).
export interface ProjectObjectInput {
  id?: string;
  libraryObjectId: string;
  transform: Record<string, unknown>;
  floorIndex: number;
  materialSlots: Record<string, unknown>;
  instanceProps: Record<string, unknown>;
}
