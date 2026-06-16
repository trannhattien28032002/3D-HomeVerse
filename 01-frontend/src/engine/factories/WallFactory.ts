/**
 * WallFactory — tạo một wall entity với đầy đủ component cần thiết.
 *
 * Geometry ban đầu chỉ là BoxGeometry ước lượng (theo cx/cy/cz/length); hình
 * dạng chính xác (cắt góc miter) do WallGeometrySystem dựng lại ở frame sau từ
 * vị trí node. Tường mang WorldSpaceMesh nên RenderSystem không áp X/Z của Transform.
 */
import * as THREE from "three";

import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallTag } from "src/engine/components/wall/WallTag";
import { Selectable } from "src/engine/components/interaction/Selectable";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WorldSpaceMesh } from "src/engine/components/render/WorldSpaceMesh";
import { World } from "src/engine/ecs/World";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { WALL_DEFAULT_MATERIAL } from "src/engine/rendering/surfaceDefaults";

export type CreateWallOptions = {
    wallId?: string;
    startNodeId: string;
    endNodeId: string;
    /** Vị trí tâm (tính sẵn hoặc mặc định 0,0,0 — WallGeometrySystem sẽ chỉnh lại) */
    cx?: number;
    cy?: number;
    cz?: number;
    /** Chiều dài ước lượng ban đầu — WallGeometrySystem sẽ tính lại từ node */
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
): string {
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
        color = WALL_DEFAULT_MATERIAL.color,
    } = opts;

    const entity = world.createEntity();

    // Geometry ban đầu — WallGeometrySystem sẽ dựng lại từ phép tính cắt góc miter
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = materialRegistry.get({ ...WALL_DEFAULT_MATERIAL, color });
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
    world.addComponent(entity, new WorldSpaceMesh());

    if (wallId !== undefined) {
        world.addComponent(entity, new WallTag(wallId));
    }

    return entity;
}
