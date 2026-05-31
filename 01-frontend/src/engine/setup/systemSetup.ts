import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { World } from "src/engine/ecs/World";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

import { OrbitControlSystem } from "src/engine/systems/OrbitControlSystem";
import { GizmoSystem } from "src/engine/systems/GizmoSystem";
import { PlacementAssistSystem } from "src/engine/systems/PlacementAssistSystem";
import { CannonCollisionSystem } from "src/engine/systems/CannonCollisionSystem";
import { DragGhostController } from "src/engine/systems/DragGhostController";
import { LightSystem } from "src/engine/systems/LightSystem";
import { WallGeometrySystem } from "src/engine/systems/WallGeometrySystem";
import { RoomSystem } from "src/engine/systems/RoomSystem";
import { RenderSystem } from "src/engine/systems/RenderSystem";
import { DimensionSystem } from "src/engine/systems/DimensionSystem";
import { SnapshotSystem } from "src/engine/systems/SnapshotSystem";
import { CollisionDebugSystem } from "src/engine/systems/CollisionDebugSystem";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";

export type SystemBundle = {
    orbit: OrbitControlSystem;
    gizmoSystem: GizmoSystem;
    collisionSystem: CannonCollisionSystem;
    dragGhostController: DragGhostController;
};

/**
 * Required system execution order (enforced by insertion sequence below):
 *
 *  Phase 1 — Input / Control
 *    OrbitControlSystem, GizmoSystem, PlacementAssistSystem, CannonCollisionSystem
 *
 *  Phase 2 — Geometry rebuild
 *    LightSystem, WallGeometrySystem, RoomSystem
 *
 *  Phase 3 — Annotation / Snapshot  (must follow geometry)
 *    DimensionSystem → SnapshotSystem
 *
 *  Phase 4 — Render  (must be last)
 *    RenderSystem
 *
 * CollisionDebugSystem is DEV-only and appended after RenderSystem.
 *
 * WARNING: addSystem() insertion order IS the execution order.
 * Reordering calls below will silently break the pipeline.
 */
export function createSystems(
    world: World,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    nodeRegistry: NodeRegistry,
    events: EngineEvents,
    meshRegistry: MeshRegistry,
    materialRegistry: MaterialRegistry,
): SystemBundle {
    const orbit = new OrbitControlSystem(camera, renderer, scene);
    world.addSystem(orbit);

    const collisionSystem = new CannonCollisionSystem();
    const dragGhostController = new DragGhostController(scene);

    const gizmoSystem = new GizmoSystem(camera, scene, renderer, orbit.controls as OrbitControls, events, collisionSystem, dragGhostController);
    world.addSystem(gizmoSystem);

    world.addSystem(new PlacementAssistSystem());

    world.addSystem(collisionSystem);

    world.addSystem(new LightSystem(scene));
    world.addSystem(new WallGeometrySystem(nodeRegistry, scene, meshRegistry, materialRegistry));
    world.addSystem(new RoomSystem(nodeRegistry, scene, meshRegistry, materialRegistry));

    const dimensionSystem = new DimensionSystem(nodeRegistry);
    world.addSystem(dimensionSystem);

    world.addSystem(new RenderSystem(renderer, scene, camera));
    world.addSystem(new SnapshotSystem(events, nodeRegistry, dimensionSystem));

    if (import.meta.env.DEV) {
        world.addSystem(new CollisionDebugSystem(scene));
    }

    return { orbit, gizmoSystem, collisionSystem, dragGhostController };
}
