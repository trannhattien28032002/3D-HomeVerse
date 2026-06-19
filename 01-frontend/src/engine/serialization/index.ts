/**
 * Bề mặt public của module serialization (barrel export).
 * Import từ "src/engine/serialization" — đừng import trực tiếp các file nội bộ.
 */

export type { SceneDocument, SceneNodeRecord, SceneWallRecord, AnySceneDocument } from "./SceneDocument";
export type { ValidationResult } from "./validate";
export { validateSceneDocument, validationFailed } from "./validate";
export { serializeScene } from "./serialize";
export { deserializeScene } from "./deserialize";
export type { DeserializeProgress } from "./deserialize";
