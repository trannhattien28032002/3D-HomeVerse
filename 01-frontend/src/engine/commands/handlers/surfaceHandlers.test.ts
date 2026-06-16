/**
 * surfaceHandlers.test — material tường RIÊNG từng mặt (left/right).
 *
 * Headless: World + deps tối thiểu (materialLibrary stub — buildSurfaceMaterial async
 * bị .catch nuốt; ta chỉ assert SurfaceMaterial.faces set ĐỒNG BỘ + ngữ nghĩa reset).
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { ModelRegistry } from "src/engine/registries/ModelRegistry";
import { createDispatcher } from "src/engine/commands/dispatcher";
import { SurfaceMaterial } from "src/engine/components/render/SurfaceMaterial";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

function buildDeps(): { deps: DispatcherDeps; world: World } {
    const world = new World();
    const scene = new THREE.Scene();
    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const modelRegistry = new ModelRegistry(scene);
    const entityRegistry = new EntityRegistry(world, meshRegistry, modelRegistry);
    const nodeRegistry = new NodeRegistry();
    const deps: DispatcherDeps = {
        world, scene, nodeRegistry,
        wallEntityByWallId: new Map<string, string>(),
        meshRegistry, materialRegistry, entityRegistry,
        floorMaterials: new Map(),
        materialLibrary: {} as never,
        gltfLoader: {} as never,
        modelRegistry: {} as never,
        collisionSystem: { removeStaticBody: () => {}, removeBody: () => {} } as never,
    };
    return { deps, world };
}

function addWall(dispatch: ReturnType<typeof createDispatcher>["dispatch"]): void {
    dispatch({ type: "ENSURE_NODE", nodeId: "nA", x: 0, z: 0 });
    dispatch({ type: "ENSURE_NODE", nodeId: "nB", x: 3, z: 0 });
    dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "nA", endNodeId: "nB", thickness: 0.15 });
}

const surfOf = (deps: DispatcherDeps, world: World) =>
    world.getComponent(deps.wallEntityByWallId.get("w1")!, SurfaceMaterial);

describe("SET_WALL_MATERIAL — per-face", () => {
    it("set mặt left → chỉ faces.left", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "brick", face: "left" });

        const surf = surfOf(deps, world)!;
        expect(surf.faces.left).toBe("brick");
        expect(surf.faces.right).toBeUndefined();
    });

    it("set 2 mặt khác material → giữ độc lập", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "brick", face: "left" });
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "wood", face: "right" });

        const surf = surfOf(deps, world)!;
        expect(surf.faces.left).toBe("brick");
        expect(surf.faces.right).toBe("wood");
    });

    it("set đè cùng mặt → ghi đè", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "brick", face: "left" });
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "tile", face: "left" });
        expect(surfOf(deps, world)!.faces.left).toBe("tile");
    });
});

describe("RESET_WALL_MATERIAL — per-face", () => {
    it("reset 1 mặt → giữ mặt kia", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "brick", face: "left" });
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "wood", face: "right" });
        dispatch({ type: "RESET_WALL_MATERIAL", wallId: "w1", face: "left" });

        const surf = surfOf(deps, world)!;
        expect(surf.faces.left).toBeUndefined();
        expect(surf.faces.right).toBe("wood");
    });

    it("reset mặt cuối → gỡ hẳn SurfaceMaterial component", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "brick", face: "left" });
        dispatch({ type: "RESET_WALL_MATERIAL", wallId: "w1", face: "left" });
        expect(surfOf(deps, world)).toBeUndefined();
    });

    it("reset khi chưa sơn → no-op (không crash)", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch);
        expect(() => dispatch({ type: "RESET_WALL_MATERIAL", wallId: "w1", face: "right" })).not.toThrow();
        expect(surfOf(deps, world)).toBeUndefined();
    });
});
