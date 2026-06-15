/**
 * describeScene.test.ts — WP0 perception layer.
 *
 * Dựng headless World qua dispatcher (giống dispatcher.test.ts), thêm 1 phòng kín
 * 4×3 m + 1 sofa ở giữa, rồi assert describeScene() trả đúng perception summary.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { createDispatcher } from "src/engine/commands/dispatcher";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Transform } from "src/engine/components/core/Transform";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

import { describeScene, type ScenePerceptionSource } from "src/ai/perception/describeScene";

function buildScene() {
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

    const { dispatch } = createDispatcher(deps);
    const source: ScenePerceptionSource = { world, nodes: nodeRegistry, wallEntityByWallId };
    return { world, nodeRegistry, wallEntityByWallId, dispatch, source };
}

/** Dựng phòng chữ nhật kín W×D với 4 node + 4 wall. */
function addRoom(dispatch: ReturnType<typeof createDispatcher>["dispatch"], w: number, d: number) {
    dispatch({ type: "ENSURE_NODE", nodeId: "n0", x: 0, z: 0 });
    dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: w, z: 0 });
    dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: w, z: d });
    dispatch({ type: "ENSURE_NODE", nodeId: "n3", x: 0, z: d });
    dispatch({ type: "ADD_WALL", wallId: "w0", startNodeId: "n0", endNodeId: "n1", thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "n2", endNodeId: "n3", thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: "w3", startNodeId: "n3", endNodeId: "n0", thickness: 0.15 });
}

describe("describeScene — WP0 perception", () => {
    it("empty scene → empty=true, no rooms/walls/furniture", () => {
        const { source } = buildScene();
        const s = describeScene(source);
        expect(s.empty).toBe(true);
        expect(s.rooms).toHaveLength(0);
        expect(s.walls).toHaveLength(0);
        expect(s.furniture).toHaveLength(0);
        expect(s.wallItems).toHaveLength(0);
    });

    it("1 closed room (4×3) + 1 sofa → 1 room (area 12), 4 walls, 1 furniture", () => {
        const { world, dispatch, source } = buildScene();
        addRoom(dispatch, 4, 3);

        // Sofa ở giữa phòng (2, 1.5), xoay 90°.
        const sofa = world.createEntity();
        world.addComponent(sofa, new FurnitureTag("sofa-01"));
        world.addComponent(sofa, new Transform(2, 0, 1.5, Math.PI / 2));

        const s = describeScene(source);

        expect(s.empty).toBe(false);
        expect(s.walls).toHaveLength(4);

        // Room
        expect(s.rooms).toHaveLength(1);
        const room = s.rooms[0];
        expect(room.area).toBeCloseTo(12, 1);
        expect(room.key).toBe(["n0", "n1", "n2", "n3"].sort().join(","));
        expect(room.centroid.x).toBeCloseTo(2, 2);
        expect(room.centroid.z).toBeCloseTo(1.5, 2);
        expect(room.bbox).toEqual({ minX: 0, minZ: 0, maxX: 4, maxZ: 3 });
        expect(room.wallIds).toHaveLength(4);
        expect(new Set(room.wallIds)).toEqual(new Set(["w0", "w1", "w2", "w3"]));

        // Furniture
        expect(s.furniture).toHaveLength(1);
        const f = s.furniture[0];
        expect(f.entityId).toBe(sofa);
        expect(f.modelId).toBe("sofa-01");
        expect(f.x).toBeCloseTo(2, 3);
        expect(f.z).toBeCloseTo(1.5, 3);
        expect(f.rotY).toBeCloseTo(Math.PI / 2, 3);
    });

    it("wall summary resolves node coords into from/to + length", () => {
        const { dispatch, source } = buildScene();
        addRoom(dispatch, 4, 3);
        const s = describeScene(source);

        const w0 = s.walls.find((w) => w.wallId === "w0")!;
        expect(w0.from).toEqual({ x: 0, z: 0 });
        expect(w0.to).toEqual({ x: 4, z: 0 });
        expect(w0.length).toBeCloseTo(4, 3);
        expect(w0.thickness).toBeCloseTo(0.15, 3);
    });

    it("typical room JSON stays under ~2KB", () => {
        const { world, dispatch, source } = buildScene();
        addRoom(dispatch, 4, 3);
        const sofa = world.createEntity();
        world.addComponent(sofa, new FurnitureTag("sofa-01"));
        world.addComponent(sofa, new Transform(2, 0, 1.5, 0));

        const json = JSON.stringify(describeScene(source));
        expect(json.length).toBeLessThan(2048);
    });
});
