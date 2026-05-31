/**
 * DispatcherDeps — shared dependency bag cho dispatcher + tất cả handler.
 *
 * Tách ra file riêng để dispatcher.ts (router) và handlers/*.ts (logic) cùng
 * import mà không tạo circular dependency.
 *
 * Xem `dispatcher.ts` để biết lý do dùng deps object thay vì global singleton.
 */
import type * as THREE from "three";
import type { World } from "src/engine/ecs/World";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import type { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import type { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import type { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import type { CannonCollisionSystem } from "src/engine/systems/CannonCollisionSystem";
import type { EntityRegistry } from "src/engine/registries/EntityRegistry";

export type DispatcherDeps = {
    world: World;
    scene: THREE.Scene;
    nodeRegistry: NodeRegistry;
    /** Lookup: wallId (logical) → entity (ECS id). wallId may differ from entity. */
    wallEntityByWallId: Map<number, number>;
    /** Mutable ref — SPLIT_WALL/ADD_WALL increment, RESOLVE_INTERSECTIONS đọc để lấy ID mới. */
    maxWallIdRef: { value: number };
    meshRegistry: MeshRegistry;
    materialRegistry: MaterialRegistry;
    /** GLB model loader — used by PLACE_FURNITURE to spawn real assets. */
    gltfLoader: GLTFModelLoader;
    /** Tracks GLB root Object3Ds by entity id for disposal. */
    modelRegistry: ModelRegistry;
    /** Collision system — used by MOVE_FURNITURE and ROTATE_FURNITURE to block overlaps. */
    collisionSystem: CannonCollisionSystem;
    /** Orchestrate dispose Mesh/Model registries + destroyEntity (Đợt 2). */
    entityRegistry: EntityRegistry;
};
