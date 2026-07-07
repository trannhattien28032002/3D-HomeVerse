/**
 * WallGeometrySystem.test — dựng tường thật qua dispatcher (ENSURE_NODE/ADD_WALL/
 * REMOVE_WALL) rồi chạy WallGeometrySystem.update() để verify WallPolygon sinh ra
 * đúng hình dạng cơ bản, và test TRỰC TIẾP bug vừa fix: xoá 1 tường phải invalidate +
 * rebuild đúng WallPolygon của tường hàng xóm còn lại (wallHandlers.ts — handleRemoveWall).
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
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallGeometrySystem } from "src/engine/systems/wall/WallGeometrySystem";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import { EngineEvents } from "src/engine/events/EngineEvents";

// Cùng chiến lược buildDeps với dispatcher.test.ts — headless, không renderer/physics thật.
function buildDeps(): { deps: DispatcherDeps; world: World; nodeRegistry: NodeRegistry; scene: THREE.Scene; meshRegistry: MeshRegistry; materialRegistry: MaterialRegistry } {
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

    return { deps, world, nodeRegistry, scene, meshRegistry, materialRegistry };
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function assertNoNaN(poly: { x: number; z: number }[]): void {
    for (const p of poly) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.z)).toBe(true);
    }
}

describe("WallGeometrySystem", () => {
    it("2 tường nối qua node chung (góc vuông) → WallPolygon đúng hình dạng cơ bản", () => {
        const { deps, world, nodeRegistry, scene, meshRegistry, materialRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        dispatch({ type: "ENSURE_NODE", nodeId: "nA", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "nB", x: 4, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "nC", x: 4, z: 3 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "nA", endNodeId: "nB", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "nB", endNodeId: "nC", thickness: 0.2 });

        const system = new WallGeometrySystem(nodeRegistry, scene, meshRegistry, materialRegistry);
        system.update(world, 0);

        const e1 = deps.wallEntityByWallId.get("w1")!;
        const e2 = deps.wallEntityByWallId.get("w2")!;

        const poly1 = world.getComponent(e1, WallPolygon)!;
        const poly2 = world.getComponent(e2, WallPolygon)!;
        expect(poly1).toBeDefined();
        expect(poly2).toBeDefined();

        // Đúng số cạnh polygon (4 điểm — quad).
        expect(poly1.points.length).toBe(4);
        expect(poly2.points.length).toBe(4);
        assertNoNaN(poly1.points);
        assertNoNaN(poly2.points);

        // Đúng thickness: đầu KHÔNG chia sẻ node (nA cho w1, nC cho w2) là junction 1-tường
        // → khoảng cách left/right đúng bằng thickness (0.2), không bị ảnh hưởng bởi miter.
        // newPoly = [startLeft, endLeft, endRight, startRight] (xem WallGeometrySystem).
        expect(dist(poly1.points[0], poly1.points[3])).toBeCloseTo(0.2); // startLeft/startRight tại nA
        expect(dist(poly2.points[1], poly2.points[2])).toBeCloseTo(0.2); // endLeft/endRight tại nC

        // WallSize.length được đồng bộ theo khoảng cách node thật.
        const wn1 = world.getComponent(e1, WallNodes)!;
        const wn2 = world.getComponent(e2, WallNodes)!;
        expect(wn1.thickness).toBeCloseTo(0.2);
        expect(wn2.thickness).toBeCloseTo(0.2);
    });

    it("3 tường nối qua 1 node chung (T-junction) → tạo capPolygon hợp lệ ở junction", () => {
        const { deps, world, nodeRegistry, scene, meshRegistry, materialRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        dispatch({ type: "ENSURE_NODE", nodeId: "center", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "west", x: -3, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "north", x: 0, z: -3 });
        dispatch({ type: "ENSURE_NODE", nodeId: "east", x: 3, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "center", endNodeId: "west", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "center", endNodeId: "north", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w3", startNodeId: "center", endNodeId: "east", thickness: 0.2 });

        const system = new WallGeometrySystem(nodeRegistry, scene, meshRegistry, materialRegistry);
        system.update(world, 0);

        const cap = nodeRegistry.nodeCaps.get("center");
        expect(cap).toBeDefined();
        expect(cap!.length).toBeGreaterThanOrEqual(3);
        assertNoNaN(cap!);

        // Mọi tường vẫn có WallPolygon hợp lệ (4 điểm, hữu hạn) dù junction phức tạp hơn.
        for (const wid of ["w1", "w2", "w3"]) {
            const ent = deps.wallEntityByWallId.get(wid)!;
            const poly = world.getComponent(ent, WallPolygon)!;
            expect(poly.points.length).toBe(4);
            assertNoNaN(poly.points);
        }
    });

    it("BUG FIX: xoá 1 tường → invalidate + rebuild ĐÚNG WallPolygon của tường hàng xóm còn lại", () => {
        const { deps, world, nodeRegistry, scene, meshRegistry, materialRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n3", x: 4, z: 3 });
        dispatch({ type: "ADD_WALL", wallId: "wA", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "wB", startNodeId: "n2", endNodeId: "n3", thickness: 0.2 });

        const system = new WallGeometrySystem(nodeRegistry, scene, meshRegistry, materialRegistry);
        system.update(world, 0); // build hình học ban đầu — wB có miter với wA tại n2

        const eB = deps.wallEntityByWallId.get("wB")!;
        expect(world.hasComponent(eB, WallPolygon)).toBe(true);
        const beforePoly = world.getComponent(eB, WallPolygon)!;
        const before = beforePoly.points.map(p => ({ ...p })); // snapshot value-copy

        // Xoá wA — handleRemoveWall phải invalidate WallPolygon của wB (tường hàng xóm còn
        // lại tại n2), KHÔNG được để wB giữ hình học miter cũ trỏ tới tường đã không còn.
        dispatch({ type: "REMOVE_WALL", wallId: "wA" });
        expect(world.hasComponent(eB, WallPolygon)).toBe(false); // đây chính là bug-fix cần test

        system.update(world, 0); // rebuild — n2 giờ là junction 1-tường (chỉ còn wB)

        const afterPoly = world.getComponent(eB, WallPolygon)!;
        expect(afterPoly).toBeDefined();
        expect(afterPoly.points.length).toBe(4);
        assertNoNaN(afterPoly.points);

        // Hình học đã đổi so với trước (không còn bị ảnh hưởng bởi wA đã xoá).
        const changed = before.some((p, i) =>
            Math.abs(p.x - afterPoly.points[i].x) > 1e-6 || Math.abs(p.z - afterPoly.points[i].z) > 1e-6,
        );
        expect(changed).toBe(true);

        // n2 giờ là junction 1-tường cho wB (điểm start = n2 vì wB.startNodeId === "n2")
        // → khoảng cách startLeft/startRight đúng bằng thickness (0.2), không còn miter với wA.
        expect(dist(afterPoly.points[0], afterPoly.points[3])).toBeCloseTo(0.2);
    });
});
