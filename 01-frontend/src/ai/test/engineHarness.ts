/**
 * engineHarness — dựng EngineApi headless (dispatcher thật) cho test macro tools.
 *
 * Chỉ dùng trong test: tạo World + NodeRegistry + dispatcher thật, bọc thành facade
 * EngineApi (useEngineApi shape) + ScenePerceptionSource. Lệnh sync (ENSURE_NODE,
 * ADD_WALL, MOVE_NODES) chạy thật → kiểm chứng được bằng RoomDetection.
 */
import { v4 as uuidv4 } from "uuid";
import * as THREE from "three";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { createDispatcher } from "src/engine/commands/dispatcher";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import type { EngineApi } from "src/app/hooks/useEngineApi";
import type { ScenePerceptionSource } from "src/ai/perception/describeScene";

export type EngineHarness = {
    api: EngineApi;
    perception: ScenePerceptionSource;
    world: World;
    nodeRegistry: NodeRegistry;
    wallEntityByWallId: Map<string, string>;
};

export function buildEngineHarness(): EngineHarness {
    const world = new World();
    const scene = new THREE.Scene();
    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const modelRegistry = new ModelRegistry(scene);
    const entityRegistry = new EntityRegistry(world, meshRegistry, modelRegistry);
    const nodeRegistry = new NodeRegistry();
    const wallEntityByWallId = new Map<string, string>();

    const deps: DispatcherDeps = {
        world,
        scene,
        nodeRegistry,
        wallEntityByWallId,
        meshRegistry,
        materialRegistry,
        entityRegistry,
        floorMaterials: new Map(),
        materialLibrary: {} as never,
        gltfLoader: {} as never,
        modelRegistry: {} as never,
        collisionSystem: { removeStaticBody: () => {}, removeBody: () => {} } as never,
    };

    const { dispatch, dispatchAsync } = createDispatcher(deps);

    const api: EngineApi = {
        dispatch,
        dispatchAsync,
        withTransaction: (_label, fn) => fn(),
        asyncTransaction: async (_label, fn) => { await fn(); },
        beginTransaction: () => {},
        commitTransaction: () => {},
        cancelTransaction: () => {},
        recordMoveUndo: () => {},
        recordRotateUndo: () => {},
        recordWallItemMoveUndo: () => {},
        nextNodeId: () => uuidv4(),
        nextWallId: () => uuidv4(),
    };

    return { api, perception: { world, nodes: nodeRegistry, wallEntityByWallId }, world, nodeRegistry, wallEntityByWallId };
}
