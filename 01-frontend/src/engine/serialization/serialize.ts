/**
 * serializeScene — reads the live ECS state and produces a SceneDocument.
 *
 * Sources:
 *  - engine.nodes (NodeRegistry)  → node positions
 *  - engine.wallEntityByWallId     → wall ID → entity mapping
 *  - engine.world                  → WallNodes + WallSize components per entity
 *
 * Nothing in the engine is mutated. This is a pure read operation.
 *
 * Walls whose entity is missing WallNodes or WallSize are silently skipped
 * (they are in a transitional state and not yet fully committed to ECS).
 */

import type { EngineInstance } from "src/engine/engineTypes";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallSize } from "src/engine/components/WallSize";
import { FurnitureTag } from "src/engine/components/FurnitureTag";
import { Transform } from "src/engine/components/Transform";
import { Query } from "src/engine/ecs/Query";
import type { SceneDocument, SceneNodeRecord, SceneWallRecord, SceneFurnitureRecord } from "src/engine/serialization/SceneDocument";

export function serializeScene(engine: EngineInstance): SceneDocument {
    // ── Nodes ─────────────────────────────────────────────────────────────────
    // Iterate all nodes in the registry. connectedWallIds is derived — not stored.
    const nodes: SceneNodeRecord[] = [];
    for (const n of engine.nodes.all()) {
        nodes.push({ id: n.id, x: n.x, z: n.z });
    }

    // ── Walls ─────────────────────────────────────────────────────────────────
    // wallEntityByWallId is the authoritative wall→entity mapping.
    const walls: SceneWallRecord[] = [];
    for (const [wallId, entityId] of engine.wallEntityByWallId) {
        const wn = engine.world.getComponent(entityId, WallNodes);
        const size = engine.world.getComponent(entityId, WallSize);

        // Skip entities whose components haven't been attached yet.
        // This can happen transiently during SPLIT_WALL sequences.
        if (!wn || !size) {
            console.warn(`[serialize] Wall ${wallId} (entity ${entityId}) missing components — skipped.`);
            continue;
        }

        walls.push({
            wallId,
            startNodeId: wn.startNodeId,
            endNodeId: wn.endNodeId,
            thickness: wn.thickness, // WallNodes is sole owner; WallSize no longer stores thickness
            height: size.height,
        });
    }

    // ── Furniture ─────────────────────────────────────────────────────────────
    const furniture: SceneFurnitureRecord[] = [];
    for (const e of Query.entitiesWith(engine.world, FurnitureTag, Transform)) {
        const tag = engine.world.getComponent(e, FurnitureTag)!;
        const t   = engine.world.getComponent(e, Transform)!;
        furniture.push({ modelId: tag.modelId, x: t.x, z: t.z, rotY: t.rotY });
    }

    return { version: 1, nodes, walls, furniture };
}
