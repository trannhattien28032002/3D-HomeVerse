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
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";
import type { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import type { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import type { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import type { ModelRegistry } from "src/engine/registries/ModelRegistry";
import type { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import type { EntityRegistry } from "src/engine/registries/EntityRegistry";

export type DispatcherDeps = {
    world: World;
    scene: THREE.Scene;
    nodeRegistry: NodeRegistry;
    /** Tra cứu: wallId (uuid logic) → entity (uuid ECS). wallId khác entity id. */
    wallEntityByWallId: Map<string, string>;
    meshRegistry: MeshRegistry;
    materialRegistry: MaterialRegistry;
    /** Catalog material PBR (KTX2/JPG) — APPLY_FURNITURE_MATERIAL dùng để nạp texture. */
    materialLibrary: MaterialLibrary;
    /** Bộ nạp model GLB — PLACE_FURNITURE dùng để spawn asset thật. */
    gltfLoader: GLTFModelLoader;
    /** Theo dõi Object3D gốc của GLB theo entity id để dispose. */
    modelRegistry: ModelRegistry;
    /** Hệ va chạm — MOVE_FURNITURE và ROTATE_FURNITURE dùng để chặn chồng lấn. */
    collisionSystem: CannonCollisionSystem;
    /** Điều phối dispose Mesh/Model registry + destroyEntity (Đợt 2). */
    entityRegistry: EntityRegistry;
    /** Material sàn theo roomKey (sorted nodeIds) — bền qua rebuild topology. */
    floorMaterials: Map<string, string>;
};
