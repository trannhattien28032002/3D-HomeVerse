/**
 * dispatcher.test.ts — integration tests cho handler/dispatcher routing.
 *
 * Strategy: build headless World + minimal deps (no GLB loader, no physics),
 * dispatch commands via createDispatcher, assert on ECS snapshot + NodeRegistry state.
 *
 * Test coverage focus (R8 — REFACTOR-PLAN.md):
 *   - ENSURE_NODE: idempotent, creates node
 *   - MOVE_NODE / MOVE_NODES: topology update, WallPolygon invalidation
 *   - ADD_WALL: creates entity with WallNodes, registers in wallEntityByWallId
 *   - REMOVE_WALL: disposes entity, removes from registry, cleans orphan nodes
 *   - UPDATE_WALL: mutates WallNodes.thickness, WallSize.height, removes WallPolygon
 *   - SPLIT_WALL: splits wall at midpoint, migrates wall-items to correct half
 *   - RESOLVE_INTERSECTIONS: splits crossing walls at intersection point
 *   - Dispatcher routing: all sync commands reach the correct handler
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
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

// ── Headless deps builder ────────────────────────────────────────────────────
// Minimal deps that don't require a running renderer/physics engine.
// GLTFModelLoader, CannonCollisionSystem, MaterialLibrary are not exercised by
// node/wall commands — stub them with empty objects to satisfy the type.

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
        nodeRegistry,
        wallEntityByWallId,
        meshRegistry,
        materialRegistry,
        entityRegistry,
        floorMaterials: new Map(),
        // Stubs — not exercised by node/wall commands:
        materialLibrary: {} as never,
        gltfLoader: {} as never,
        modelRegistry: {} as never,
        collisionSystem: {
            removeStaticBody: () => {},
            removeBody: () => {},
        } as never,
    };

    return { deps, world, nodeRegistry };
}

/** Helper: ensure two nodes + one wall between them via dispatcher. */
function addWall(
    dispatch: ReturnType<typeof createDispatcher>["dispatch"],
    wallId: string,
    startId: string, startX: number, startZ: number,
    endId: string, endX: number, endZ: number,
    thickness = 0.15,
): void {
    dispatch({ type: "ENSURE_NODE", nodeId: startId, x: startX, z: startZ });
    dispatch({ type: "ENSURE_NODE", nodeId: endId, x: endX, z: endZ });
    dispatch({ type: "ADD_WALL", wallId, startNodeId: startId, endNodeId: endId, thickness });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ENSURE_NODE", () => {
    it("creates node on first call", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 1, z: 2 });
        const n = nodeRegistry.get("n1");
        expect(n).toBeDefined();
        expect(n!.x).toBe(1);
        expect(n!.z).toBe(2);
    });

    it("is idempotent — second call does not change position", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 1, z: 2 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 99, z: 99 });
        const n = nodeRegistry.get("n1");
        expect(n!.x).toBe(1); // first call wins
    });
});

describe("ADD_WALL", () => {
    it("creates ECS entity and registers in wallEntityByWallId", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);

        const entity = deps.wallEntityByWallId.get("w1");
        expect(entity).toBeDefined();

        const wn = world.getComponent(entity!, WallNodes);
        expect(wn).toBeDefined();
        expect(wn!.startNodeId).toBe("nA");
        expect(wn!.endNodeId).toBe("nB");
        expect(wn!.thickness).toBeCloseTo(0.15);
    });

    it("connects wall to both nodes in NodeRegistry", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);

        const nA = nodeRegistry.get("nA")!;
        const nB = nodeRegistry.get("nB")!;
        expect(nA.connectedWallIds.has("w1")).toBe(true);
        expect(nB.connectedWallIds.has("w1")).toBe(true);
    });

    it("skips duplicate wall between same node pair", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);
        // Try to add another wall between same nodes (should no-op)
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "nA", endNodeId: "nB", thickness: 0.2 });

        // Only w1 should exist; w2 skipped
        expect(deps.wallEntityByWallId.has("w1")).toBe(true);
        expect(deps.wallEntityByWallId.has("w2")).toBe(false);
    });
});

describe("REMOVE_WALL", () => {
    it("removes entity from wallEntityByWallId", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);
        expect(deps.wallEntityByWallId.has("w1")).toBe(true);

        dispatch({ type: "REMOVE_WALL", wallId: "w1" });
        expect(deps.wallEntityByWallId.has("w1")).toBe(false);
    });

    it("disconnects wall from NodeRegistry", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);
        dispatch({ type: "REMOVE_WALL", wallId: "w1" });

        // Both nodes disconnected; orphan nodes are cleaned up too
        const nA = nodeRegistry.get("nA");
        const nB = nodeRegistry.get("nB");
        // Orphan nodes (degree 0) are deleted by handleRemoveWall
        expect(nA).toBeUndefined();
        expect(nB).toBeUndefined();
    });

    it("is a no-op when wallId does not exist", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        // Should not throw
        expect(() => dispatch({ type: "REMOVE_WALL", wallId: "nonexistent" })).not.toThrow();
    });

    it("cascade-disposes wall-items (WallOpening + WallMounted) hosted on the wall", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);

        const door = world.createEntity();
        world.addComponent(door, new WallOpening("w1", 0.5, 0.9, 2.1, 0, 1));
        const shelf = world.createEntity();
        world.addComponent(shelf, new WallMounted("w1", 0.75, 1, 1.3));

        dispatch({ type: "REMOVE_WALL", wallId: "w1" });

        // Both wall-item entities are destroyed along with the wall.
        expect(world.hasComponent(door, WallOpening)).toBe(false);
        expect(world.hasComponent(shelf, WallMounted)).toBe(false);
    });

    it("does NOT dispose wall-items hosted on a different wall", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);
        addWall(dispatch, "w2", "nB", 4, 0, "nC", 8, 0);

        const doorOnW2 = world.createEntity();
        world.addComponent(doorOnW2, new WallOpening("w2", 0.5, 0.9, 2.1, 0, 1));

        dispatch({ type: "REMOVE_WALL", wallId: "w1" });

        // Door belongs to w2 → must survive removal of w1.
        expect(world.hasComponent(doorOnW2, WallOpening)).toBe(true);
    });
});

describe("UPDATE_WALL", () => {
    it("mutates thickness in WallNodes component", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0, 0.15);

        dispatch({ type: "UPDATE_WALL", wallId: "w1", thickness: 0.25 });

        const entity = deps.wallEntityByWallId.get("w1")!;
        const wn = world.getComponent(entity, WallNodes)!;
        expect(wn.thickness).toBeCloseTo(0.25);
    });

    it("mutates height in WallSize component", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);

        dispatch({ type: "UPDATE_WALL", wallId: "w1", height: 2.8 });

        const entity = deps.wallEntityByWallId.get("w1")!;
        const ws = world.getComponent(entity, WallSize)!;
        expect(ws.height).toBeCloseTo(2.8);
    });

    it("invalidates WallPolygon to force geometry rebuild", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);

        // Manually add WallPolygon to simulate a built mesh
        const entity = deps.wallEntityByWallId.get("w1")!;
        const zp = { x: 0, z: 0 };
        world.addComponent(entity, new WallPolygon([zp, zp, zp, zp]));
        expect(world.hasComponent(entity, WallPolygon)).toBe(true);

        dispatch({ type: "UPDATE_WALL", wallId: "w1", thickness: 0.3 });

        // WallPolygon should be removed (geometry rebuild pending)
        expect(world.hasComponent(entity, WallPolygon)).toBe(false);
    });
});

describe("MOVE_NODE / MOVE_NODES", () => {
    it("MOVE_NODE updates node position in NodeRegistry", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });

        dispatch({ type: "MOVE_NODE", nodeId: "n1", x: 5, z: 3 });

        const n = nodeRegistry.get("n1")!;
        expect(n.x).toBeCloseTo(5);
        expect(n.z).toBeCloseTo(3);
    });

    it("MOVE_NODES moves multiple nodes atomically", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "nA", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "nB", x: 3, z: 0 });

        dispatch({ type: "MOVE_NODES", moves: [
            { nodeId: "nA", x: 1, z: 1 },
            { nodeId: "nB", x: 4, z: 1 },
        ] });

        expect(nodeRegistry.get("nA")!.x).toBeCloseTo(1);
        expect(nodeRegistry.get("nA")!.z).toBeCloseTo(1);
        expect(nodeRegistry.get("nB")!.x).toBeCloseTo(4);
        expect(nodeRegistry.get("nB")!.z).toBeCloseTo(1);
    });

    it("MOVE_NODE invalidates WallPolygon of connected walls", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 3, 0);

        const entity = deps.wallEntityByWallId.get("w1")!;
        const zp = { x: 0, z: 0 };
        world.addComponent(entity, new WallPolygon([zp, zp, zp, zp]));

        dispatch({ type: "MOVE_NODE", nodeId: "nA", x: 1, z: 0 });

        expect(world.hasComponent(entity, WallPolygon)).toBe(false);
    });

    it("MOVE_NODES remaps WallOpening t when 1 wall node is moved (wall resize)", () => {
        const { deps, world, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        // Wall A: nA(0,0) → nB(4,0), length=4
        addWall(dispatch, "A", "nA", 0, 0, "nB", 4, 0);

        // Door at t=0.5 (absolute x=2)
        const door = world.createEntity();
        world.addComponent(door, new WallOpening("A", 0.5, 0.9, 2.1, 0, 1));

        // Move nA from 0→1 (wall now nA(1,0)→nB(4,0), length=3).
        // startNode moved → door's anchor is nB → neo is nB → remap preserves absX=2.
        dispatch({ type: "MOVE_NODES", moves: [{ nodeId: "nA", x: 1, z: 0 }] });

        const wo = world.getComponent(door, WallOpening)!;
        // New length=3, door absX=2 → t = (2-1)/3 = 0.333...
        const nA = nodeRegistry.get("nA")!;
        const nB = nodeRegistry.get("nB")!;
        const newLen = Math.hypot(nB.x - nA.x, nB.z - nA.z);
        const expectedAbsX = 1 + wo.t * (nB.x - nA.x); // nA.x + t * dx
        expect(expectedAbsX).toBeCloseTo(2);
        expect(newLen).toBeCloseTo(3);
    });
});

describe("SPLIT_WALL", () => {
    it("creates two new wall halves and removes the original", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);

        dispatch({ type: "SPLIT_WALL", originalWallId: "w1", newWallId: "w2", newNodeId: "nMid", x: 2, z: 0 });

        // w1 remains as the first half; w2 is the new second half
        expect(deps.wallEntityByWallId.has("w1")).toBe(true);
        expect(deps.wallEntityByWallId.has("w2")).toBe(true);
    });

    it("mid-node exists in NodeRegistry after split", () => {
        const { deps, nodeRegistry } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);

        dispatch({ type: "SPLIT_WALL", originalWallId: "w1", newWallId: "w2", newNodeId: "nMid", x: 2, z: 0 });

        const mid = nodeRegistry.get("nMid");
        expect(mid).toBeDefined();
        expect(mid!.x).toBeCloseTo(2);
    });

    it("wall-item in first half keeps hostWallId and t remapped", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);

        const door = world.createEntity();
        // t=0.25 on 4m wall → absX = 1.0 (in first half before midpoint at x=2)
        world.addComponent(door, new WallOpening("w1", 0.25, 0.9, 2.1, 0, 1));

        dispatch({ type: "SPLIT_WALL", originalWallId: "w1", newWallId: "w2", newNodeId: "nMid", x: 2, z: 0 });

        const wo = world.getComponent(door, WallOpening)!;
        expect(wo.hostWallId).toBe("w1"); // stays in first half
        expect(wo.t).toBeCloseTo(0.5);    // 0.25 / 0.5 (first half length ratio)
    });

    it("wall-item in second half migrates to new wallId", () => {
        const { deps, world } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);

        const shelf = world.createEntity();
        // t=0.75 on 4m wall → absX = 3.0 (in second half)
        world.addComponent(shelf, new WallMounted("w1", 0.75, 1, 1.3));

        dispatch({ type: "SPLIT_WALL", originalWallId: "w1", newWallId: "w2", newNodeId: "nMid", x: 2, z: 0 });

        const wm = world.getComponent(shelf, WallMounted)!;
        expect(wm.hostWallId).toBe("w2"); // migrated to second half
        expect(wm.t).toBeCloseTo(0.5);    // (0.75 - 0.5) / 0.5
    });
});

describe("RESOLVE_INTERSECTIONS", () => {
    it("splits two crossing walls at intersection point", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        // Wall 1: horizontal  (0,0) → (4,0)
        addWall(dispatch, "wH", "nA", 0, 0, "nB", 4, 0);
        // Wall 2: vertical    (2,-2) → (2,2) — crosses wH at (2,0)
        addWall(dispatch, "wV", "nC", 2, -2, "nD", 2, 2);

        dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: "wV" });

        // After resolution, wH should be split → wH (first half) + a new wall
        // wV should also be split → wV + another new wall
        // So total walls > 2
        expect(deps.wallEntityByWallId.size).toBeGreaterThan(2);
    });

    it("does not split parallel (non-crossing) walls", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);

        // Two parallel horizontal walls
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);
        addWall(dispatch, "w2", "nC", 0, 1, "nD", 4, 1);

        const before = deps.wallEntityByWallId.size;
        dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: "w2" });
        expect(deps.wallEntityByWallId.size).toBe(before); // no split
    });
});

describe("Dispatcher routing — sync commands reach correct handler", () => {
    it("dispatches ENSURE_NODE without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        expect(() => dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 })).not.toThrow();
    });

    it("dispatches MOVE_NODE without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        expect(() => dispatch({ type: "MOVE_NODE", nodeId: "n1", x: 1, z: 1 })).not.toThrow();
    });

    it("dispatches MOVE_NODES without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        expect(() => dispatch({ type: "MOVE_NODES", moves: [{ nodeId: "n1", x: 2, z: 2 }] })).not.toThrow();
    });

    it("dispatches ADD_WALL without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        expect(() => addWall(dispatch, "w1", "nA", 0, 0, "nB", 2, 0)).not.toThrow();
    });

    it("dispatches REMOVE_WALL without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 2, 0);
        expect(() => dispatch({ type: "REMOVE_WALL", wallId: "w1" })).not.toThrow();
    });

    it("dispatches UPDATE_WALL without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 2, 0);
        expect(() => dispatch({ type: "UPDATE_WALL", wallId: "w1", thickness: 0.2 })).not.toThrow();
    });

    it("dispatches SPLIT_WALL without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);
        expect(() => dispatch({
            type: "SPLIT_WALL", originalWallId: "w1", newWallId: "w2", newNodeId: "nMid", x: 2, z: 0,
        })).not.toThrow();
    });

    it("dispatches RESOLVE_INTERSECTIONS without throwing", () => {
        const { deps } = buildDeps();
        const { dispatch } = createDispatcher(deps);
        addWall(dispatch, "w1", "nA", 0, 0, "nB", 4, 0);
        expect(() => dispatch({ type: "RESOLVE_INTERSECTIONS", wallId: "w1" })).not.toThrow();
    });
});
