import * as THREE from "three";

import { Transform } from "src/engine/components/Transform";
import { Mesh } from "src/engine/components/Mesh";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { StaticBody } from "src/engine/components/StaticBody";
import { WallSize } from "src/engine/components/WallSize";
import { WallTag } from "src/engine/components/WallTag";
import { Selectable } from "src/engine/components/Selectable";
import { SnapToGrid } from "src/engine/components/SnapToGrid";
import { AutoAlign } from "src/engine/components/AutoAlign";
import { WallNodes } from "src/engine/components/WallNodes";
import { World } from "src/engine/ecs/World";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";

export type CreateWallOptions = {
    wallId?: number;
    startNodeId: number;
    endNodeId: number;
    /** Center position (pre-computed or defaults to 0,0,0 — WallGeometrySystem will fix it) */
    cx?: number;
    cy?: number;
    cz?: number;
    /** Initial length estimate — WallGeometrySystem will recompute from nodes */
    length?: number;
    height?: number;
    thickness: number;
    color?: number;
};

export function createWall(
    world: World,
    scene: THREE.Scene,
    opts: CreateWallOptions,
    meshRegistry: MeshRegistry,
    materialRegistry: MaterialRegistry,
): number {
    const {
        wallId,
        startNodeId,
        endNodeId,
        cx = 0,
        cy = 0.5,
        cz = 0,
        length = 1,
        height = 1,
        thickness,
        color = 0xcccccc,
    } = opts;

    const entity = world.createEntity();

    // Initial geometry — WallGeometrySystem will rebuild from miter calc
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = materialRegistry.get({ color, metalness: 0, roughness: 0.9 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRegistry.register(`wall-${entity}`, mesh);

    world.addComponent(entity, new Transform(cx, cy, cz, 0));
    world.addComponent(entity, new Mesh(mesh));
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(length / 2, height / 2, thickness / 2));
    world.addComponent(entity, new WallSize({ length, height, thickness }));
    world.addComponent(entity, new WallNodes(startNodeId, endNodeId, thickness));
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new SnapToGrid({ enabled: true, size: 0.1, axes: "xz" }));
    world.addComponent(entity, new AutoAlign({ enabled: true, axes: "xz", tolerance: 0.2 }));

    if (wallId !== undefined) {
        world.addComponent(entity, new WallTag(wallId));
    }

    return entity;
}
