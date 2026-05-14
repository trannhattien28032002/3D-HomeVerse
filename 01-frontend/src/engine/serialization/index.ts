/**
 * Public surface of the serialization module.
 * Import from "src/engine/serialization" — do not import internal files directly.
 */

export type { SceneDocument, SceneNodeRecord, SceneWallRecord, AnySceneDocument } from "./SceneDocument";
export type { ValidationResult } from "./validate";
export { validateSceneDocument, validationFailed } from "./validate";
export { serializeScene } from "./serialize";
export { deserializeScene } from "./deserialize";
