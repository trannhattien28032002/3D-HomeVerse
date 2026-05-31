import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { Transform } from "src/engine/components/Transform";
import { Mesh } from "src/engine/components/Mesh";
import { Selectable } from "src/engine/components/Selectable";
import { StaticBody } from "src/engine/components/StaticBody";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { FurnitureTag } from "src/engine/components/FurnitureTag";
import { Model3D } from "src/engine/components/Model3D";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { getAssetPath, getBoundingBox } from "src/engine/game/FurnitureCatalog";
import { resolveCollisionFootprint } from "src/engine/game/getFootprint";

/** Approximate bounding box dimensions [width, height, depth] in metres. */
export const FURNITURE_SIZES: Record<string, [number, number, number]> = {
    single_bed_01:   [1.0, 0.45, 2.0],
    bunk_bed_01:     [1.0, 1.8,  2.0],
    fridge_01:       [0.7, 1.8,  0.7],
    wardrobe_01:     [1.2, 2.0,  0.6],
    armchair_01:     [0.9, 0.9,  0.9],
    dining_table_01: [1.6, 0.75, 0.9],
    floor_lamp_01:   [0.3, 1.6,  0.3],
    plant_01:        [0.5, 0.8,  0.5],
    mixer_01:        [0.3, 0.4,  0.3],
    fireplace_01:    [1.2, 1.0,  0.5],
    patio_set_01:    [2.0, 0.8,  2.0],
    rug_01:          [2.0, 0.02, 1.5],
};

const DEFAULT_SIZE: [number, number, number] = [0.8, 0.8, 0.8];

export function getFurnitureSize(modelId: string): [number, number, number] {
    return FURNITURE_SIZES[modelId] ?? DEFAULT_SIZE;
}

/**
 * Spawn a permanent furniture entity at (x, z) on the floor.
 * Uses a BoxGeometry placeholder — GLB support is a future enhancement.
 * Returns the ECS entity id.
 */
export function spawnFurniture(
    world: World,
    scene: THREE.Scene,
    modelId: string,
    x: number,
    z: number,
    meshRegistry: MeshRegistry,
    materialRegistry: MaterialRegistry,
): number {
    const [w, h, d] = getFurnitureSize(modelId);
    const y = h / 2;

    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = materialRegistry.get({ color: 0xa0856a, metalness: 0, roughness: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const entity = world.createEntity();
    meshRegistry.register(`furniture-${entity}`, mesh);

    world.addComponent(entity, new Transform(x, y, z, 0));
    world.addComponent(entity, new Mesh(mesh));
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(w / 2, h / 2, d / 2));
    world.addComponent(entity, new FurnitureTag(modelId));

    return entity;
}

/**
 * Spawn a furniture entity using a real GLB model loaded via GLTFModelLoader.
 * The model is cloned from the loader's cache so geometry is shared.
 * Returns the ECS entity id (async — resolves after the GLB is loaded and placed).
 */
export async function spawnFurnitureGLB(
    world: World,
    scene: THREE.Scene,
    modelId: string,
    x: number,
    z: number,
    rotY: number = 0,
    loader: GLTFModelLoader,
    modelRegistry: ModelRegistry,
): Promise<number> {
    const assetPath = getAssetPath(modelId);
    const template = await loader.load(assetPath, getBoundingBox(modelId));

    const root = template.scene.clone(true);
    // Only set X and Z — Y is preserved from pivot normalization in GLTFModelLoader
    root.position.x = x;
    root.position.z = z;
    if (rotY !== 0) {
        const half = rotY / 2;
        root.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
    }

    root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(root);

    const entity = world.createEntity();
    modelRegistry.register(entity, root);

    // Resolve collision dims via priority chain: _col mesh → JSON → visual AABB.
    // Transform.y uses visual height so the mesh sits flush on the floor (pivot = bottom-center).
    // ColliderAABB uses the resolved footprint so physics matches designer intent.
    const fp = resolveCollisionFootprint(modelId, template);
    const sy = template.size.y; // visual height — keeps entity standing on floor

    world.addComponent(entity, new Transform(x, sy / 2, z, rotY));
    world.addComponent(entity, new Model3D(root, modelId));
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(fp.width / 2, fp.height / 2, fp.depth / 2));
    world.addComponent(entity, new FurnitureTag(modelId));

    return entity;
}
