/**
 * RoomSystem.test — dựng tường thật qua dispatcher, chạy RoomSystem.update() (KHÔNG
 * truyền scene — system bỏ qua bước dựng Three.js mesh, chỉ test RoomGeometry/area),
 * verify phòng kín → đúng 1 RoomGeometry với area đúng; tường hở → không tạo room;
 * 2 phòng tách biệt → 2 room riêng.
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
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";
import { RoomSystem } from "src/engine/systems/annotation/RoomSystem";
import { Query } from "src/engine/ecs/Query";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import { EngineEvents } from "src/engine/events/EngineEvents";

function buildDeps(): { deps: DispatcherDeps; world: World; nodeRegistry: NodeRegistry } {
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
        events: new EngineEvents(),
        nodeRegistry,
        wallEntityByWallId,
        meshRegistry,
        materialRegistry,
        entityRegistry,
        floorMaterials: new Map(),
        roomTypes: new Map(),
        materialLibrary: {} as never,
        gltfLoader: {} as never,
        modelRegistry: {} as never,
        collisionSystem: { removeStaticBody: () => {}, removeBody: () => {} } as never,
    };

    return { deps, world, nodeRegistry };
}

/** Dựng 1 vòng tường kín hình chữ nhật width×depth, góc dưới-trái tại (originX, originZ). */
function buildRectRoom(
    dispatch: ReturnType<typeof createDispatcher>["dispatch"],
    prefix: string,
    originX: number,
    originZ: number,
    width: number,
    depth: number,
): void {
    const n1 = `${prefix}-n1`, n2 = `${prefix}-n2`, n3 = `${prefix}-n3`, n4 = `${prefix}-n4`;
    dispatch({ type: "ENSURE_NODE", nodeId: n1, x: originX, z: originZ });
    dispatch({ type: "ENSURE_NODE", nodeId: n2, x: originX + width, z: originZ });
    dispatch({ type: "ENSURE_NODE", nodeId: n3, x: originX + width, z: originZ + depth });
    dispatch({ type: "ENSURE_NODE", nodeId: n4, x: originX, z: originZ + depth });
    dispatch({ type: "ADD_WALL", wallId: `${prefix}-w1`, startNodeId: n1, endNodeId: n2, thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: `${prefix}-w2`, startNodeId: n2, endNodeId: n3, thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: `${prefix}-w3`, startNodeId: n3, endNodeId: n4, thickness: 0.15 });
    dispatch({ type: "ADD_WALL", wallId: `${prefix}-w4`, startNodeId: n4, endNodeId: n1, thickness: 0.15 });
}

describe("RoomSystem", () => {
    it("4 tường tạo phòng kín 4×3m → đúng 1 RoomGeometry, area = 12 m²", () => {
        const { deps, world, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        buildRectRoom(dispatch, "r", 0, 0, 4, 3);

        const system = new RoomSystem(nodeRegistry); // không truyền scene — bỏ qua dựng mesh
        system.update(world, 0);

        const rooms = Query.entitiesWith(world, RoomGeometry);
        expect(rooms.length).toBe(1);
        const geo = world.getComponent(rooms[0], RoomGeometry)!;
        expect(geo.area).toBeCloseTo(12);
    });

    it("tường hở (thiếu 1 cạnh) → KHÔNG tạo room nào", () => {
        const { deps, world, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n3", x: 4, z: 3 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n4", x: 0, z: 3 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.15 });
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "n2", endNodeId: "n3", thickness: 0.15 });
        dispatch({ type: "ADD_WALL", wallId: "w3", startNodeId: "n3", endNodeId: "n4", thickness: 0.15 });
        // Thiếu cạnh n4-n1 → không khép kín.

        const system = new RoomSystem(nodeRegistry);
        system.update(world, 0);

        const rooms = Query.entitiesWith(world, RoomGeometry);
        expect(rooms.length).toBe(0);
    });

    it("2 phòng tách biệt (không chung node) → 2 RoomGeometry riêng, đúng area từng phòng", () => {
        const { deps, world, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        buildRectRoom(dispatch, "a", 0, 0, 4, 3);   // area 12
        buildRectRoom(dispatch, "b", 20, 20, 2, 2); // area 4, cách xa để chắc chắn không chung node

        const system = new RoomSystem(nodeRegistry);
        system.update(world, 0);

        const rooms = Query.entitiesWith(world, RoomGeometry);
        expect(rooms.length).toBe(2);
        const areas = rooms.map(id => world.getComponent(id, RoomGeometry)!.area).sort((a, b) => a - b);
        expect(areas[0]).toBeCloseTo(4);
        expect(areas[1]).toBeCloseTo(12);
    });

    it("phòng bị xoá 1 tường (mở ra) sau khi đã detect → RoomGeometry entity tương ứng bị gỡ", () => {
        const { deps, world, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        buildRectRoom(dispatch, "r", 0, 0, 4, 3);

        const system = new RoomSystem(nodeRegistry);
        system.update(world, 0);
        expect(Query.entitiesWith(world, RoomGeometry).length).toBe(1);

        dispatch({ type: "REMOVE_WALL", wallId: "r-w1" });
        system.update(world, 0);

        expect(Query.entitiesWith(world, RoomGeometry).length).toBe(0);
    });
});
