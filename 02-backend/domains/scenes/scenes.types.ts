// Typed scene data shape. The `version` field is required; all other fields pass through.
// Per Decision B, the scene is a single opaque JSONB blob — there is no per-object registry.
export interface SceneData {
  version: number;
  [key: string]: unknown;
}

// Response shape for GET /projects/:id/scene.
export interface LoadSceneResponse {
  sceneData: SceneData;
}

// Request body for PUT /projects/:id/scene.
export interface SaveSceneBody {
  sceneData: SceneData;
}
