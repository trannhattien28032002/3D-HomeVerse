/**
 * SceneDocument — định dạng file lưu trữ scene HomeVerse (.homeverseplan).
 *
 * Chỉ lưu topology (nodes + walls) — KHÔNG lưu mesh, material, hay render state.
 * Toàn bộ geometry được ECS systems tái tạo sau khi deserialize.
 *
 * Phiên bản hiện tại: v1. Bump version khi có breaking change, viết migration function.
 *
 * HomeVerse Scene Document — persistent file format.
 *
 * Design rules:
 *  - `version` is a discriminated literal so migration functions can switch on it.
 *  - Only topology is stored (nodes + walls). All geometry is regenerated from ECS
 *    by the normal system pipeline after deserialization.
 *  - No mesh data, no material data, no render state.
 *  - Add new optional fields inside the SAME version when backward-compatible.
 *    Bump version only on breaking changes; provide a migration function.
 */

// ── Node record ───────────────────────────────────────────────────────────────

export type SceneNodeRecord = {
    /** Stable numeric ID — must be unique within the document. */
    id: number;
    /** World-space X position (metres). */
    x: number;
    /** World-space Z position (metres). */
    z: number;
};

// ── Wall record ───────────────────────────────────────────────────────────────

export type SceneWallRecord = {
    /** Stable wall ID — must be unique within the document. */
    wallId: number;
    /** ID of the start node — must exist in the nodes array. */
    startNodeId: number;
    /** ID of the end node — must exist in the nodes array. */
    endNodeId: number;
    /** Wall thickness in metres (e.g. 0.15). */
    thickness: number;
    /** Wall height in metres (e.g. 3.2). */
    height: number;
};

// ── Document root ─────────────────────────────────────────────────────────────

export type SceneDocument = {
    /** Schema version — always the literal 1 for this shape. */
    version: 1;
    nodes: SceneNodeRecord[];
    walls: SceneWallRecord[];
};

// ── Future-proofing ───────────────────────────────────────────────────────────

/**
 * Union of all known document versions.
 * When version 2 is introduced, add `| SceneDocumentV2` here and write a
 * migrateV1toV2(doc: SceneDocument): SceneDocumentV2 function in migrations.ts.
 */
export type AnySceneDocument = SceneDocument;
