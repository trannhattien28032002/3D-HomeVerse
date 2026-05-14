/**
 * deserializeScene — clears the current scene and rebuilds it from a SceneDocument
 * by dispatching standard engine commands.
 *
 * Strategy:
 *  1. Snapshot all current wall IDs (Map is mutated during removal).
 *  2. Dispatch REMOVE_WALL for each — the dispatcher auto-deletes orphaned nodes.
 *  3. Dispatch ENSURE_NODE for every node in the document.
 *  4. Dispatch ADD_WALL for every wall in the document.
 *
 * Why dispatcher commands (not direct ECS mutation):
 *  - All validation and side-effects (AABB recompute, polygon invalidation, etc.)
 *    run through the same paths as normal user editing.
 *  - maxWallIdRef and NodeRegistry.nextId are self-correcting via the dispatcher.
 *
 * Why RESOLVE_INTERSECTIONS is NOT dispatched:
 *  - The saved scene was already topologically consistent. Re-running resolution
 *    would create extra nodes/walls not in the document, corrupting the load.
 *
 * Isolated nodes (nodes with no walls) are preserved — they are created by
 * ENSURE_NODE and will remain in the registry. This matches the serialize
 * behaviour which includes all registry nodes.
 */

import type { EngineInstance } from "src/engine/engineTypes";
import type { SceneDocument } from "./SceneDocument";

export function deserializeScene(doc: SceneDocument, engine: EngineInstance): void {
    const dispatch = engine.api.dispatch;

    // ── 1. Clear existing scene ───────────────────────────────────────────────
    // Snapshot the wall IDs first — the Map is mutated by each REMOVE_WALL dispatch.
    const existingWallIds = [...engine.wallEntityByWallId.keys()];
    for (const wallId of existingWallIds) {
        dispatch({ type: "REMOVE_WALL", wallId });
    }

    // ── 2. Restore nodes ──────────────────────────────────────────────────────
    // All nodes must exist before any ADD_WALL is dispatched.
    for (const node of doc.nodes) {
        dispatch({ type: "ENSURE_NODE", nodeId: node.id, x: node.x, z: node.z });
    }

    // ── 3. Restore walls ──────────────────────────────────────────────────────
    for (const wall of doc.walls) {
        dispatch({
            type:        "ADD_WALL",
            wallId:      wall.wallId,
            startNodeId: wall.startNodeId,
            endNodeId:   wall.endNodeId,
            thickness:   wall.thickness,
        });

        // Restore wall height if it differs from the factory default (3.2 m).
        // ADD_WALL always creates walls at the factory default height; UPDATE_WALL
        // is the correct command to override it without a mesh rebuild cycle.
        if (Math.abs(wall.height - 3.2) > 1e-4) {
            dispatch({ type: "UPDATE_WALL", wallId: wall.wallId, height: wall.height });
        }
    }
}
