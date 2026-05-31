import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { Mesh } from "src/engine/components/Mesh";
import { Selectable } from "src/engine/components/Selectable";
import { WallNodes } from "src/engine/components/WallNodes";
import { Model3D } from "src/engine/components/Model3D";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { Transform } from "src/engine/components/Transform";
import { CannonCollisionSystem } from "src/engine/systems/CannonCollisionSystem";

export type MeshWithEntity = THREE.Object3D & { __entity?: number };

/** Fill `into` with all raycaster-pickable mesh objects in the world (walls excluded). */
export function collectPickTargets(world: World, into: THREE.Object3D[]): void {
    into.length = 0;

    const entities = Query.entitiesWith(world, Mesh, Selectable);
    for (const e of entities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const meshComp = world.getComponent(e, Mesh);
        if (!meshComp) continue;
        (meshComp.mesh as MeshWithEntity).__entity = e;
        into.push(meshComp.mesh);
    }

    const model3dEntities = Query.entitiesWith(world, Model3D, Selectable);
    for (const e of model3dEntities) {
        if (world.hasComponent(e, WallNodes)) continue;
        const modelComp = world.getComponent(e, Model3D);
        if (!modelComp) continue;
        modelComp.root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                (child as MeshWithEntity).__entity = e;
                into.push(child as THREE.Mesh);
            }
        });
    }
}

/**
 * Resolve a raycast hit to its owning entity and the correct Three.js attach target.
 * Returns null when the hit object carries no entity.
 */
export function resolveHitEntity(
    hitObject: MeshWithEntity,
    world: World,
): { entityId: number; attachTarget: THREE.Object3D } | null {
    const entityId = hitObject.__entity ?? null;
    if (entityId == null) return null;

    const modelComp = world.getComponent(entityId, Model3D);
    if (modelComp) {
        (modelComp.root as MeshWithEntity).__entity = entityId;
        return { entityId, attachTarget: modelComp.root };
    }
    return { entityId, attachTarget: hitObject };
}

/**
 * Check whether a rotation would cause a collision; revert the object's quaternion if so.
 * Marks the world dirty when the rotation is accepted.
 */
export function applyRotateCheck(
    controls: TransformControls,
    transform: Transform,
    collider: ColliderAABB | null,
    collisionSystem: CannonCollisionSystem,
    entity: number,
    world: World,
): void {
    const object = controls.object!;
    const q = object.quaternion;

    if (!collider) {
        transform.setQuaternion(q.x, q.y, q.z, q.w);
        world.markDirty();
        return;
    }

    const blocked = collisionSystem.wouldCollideCustom(
        transform.x, transform.y, transform.z,
        collider.width * 2, collider.depth * 2, collider.height * 2,
        q.x, q.y, q.z, q.w,
        entity,
    );

    if (blocked) {
        object.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
    } else {
        transform.setQuaternion(q.x, q.y, q.z, q.w);
        world.markDirty();
    }
}
