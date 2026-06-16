/**
 * Integration test cho splitWallAt — tập trung vào DI TRÚ wall-items khi tường bị cắt.
 *
 * Dựng World thật + NodeRegistry + registries, tạo tường A = [(0,0)→(4,0)] với 1 cửa
 * (WallOpening) ở nửa đầu và 1 kệ (WallMounted) ở nửa sau, rồi cắt A tại giữa (x=2).
 * Khẳng định: vị trí TUYỆT ĐỐI của item dọc tim tường KHÔNG đổi sau khi cắt.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { createWall } from "src/engine/factories/WallFactory";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { splitWallAt } from "src/engine/commands/handlers/wallTopology";
import { findMountWall } from "src/engine/adapters/wallRefs";
import { mountTransform } from "src/shared/geometry/wallMount";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

function setup() {
    const world = new World();
    const scene = new THREE.Scene();
    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const nodeRegistry = new NodeRegistry();
    const wallEntityByWallId = new Map<string, string>();

    const deps = {
        world, scene, nodeRegistry, wallEntityByWallId, meshRegistry, materialRegistry,
    } as unknown as DispatcherDeps;

    // Tường A dọc +X từ (0,0) tới (4,0).
    nodeRegistry.ensureNode("nA", 0, 0);
    nodeRegistry.ensureNode("nB", 4, 0);
    const entA = createWall(world, scene,
        { wallId: "A", startNodeId: "nA", endNodeId: "nB", thickness: 0.2 },
        meshRegistry, materialRegistry);
    nodeRegistry.connectWall("nA", "A");
    nodeRegistry.connectWall("nB", "A");
    wallEntityByWallId.set("A", entA);

    return { world, nodeRegistry, deps };
}

/** Tâm-X tuyệt đối (world) của item theo (hostWallId, t) hiện tại. */
function absX(deps: DispatcherDeps, hostWallId: string, t: number): number {
    const wall = findMountWall(deps.world, deps.nodeRegistry, hostWallId)!;
    return mountTransform(wall, t, 1, 0).x;
}

describe("splitWallAt — di trú wall-items", () => {
    it("cửa ở nửa đầu: giữ tường gốc, vị trí tuyệt đối không đổi", () => {
        const { world, deps } = setup();
        const door = world.createEntity();
        // t=0.25 trên tường dài 4 → absX = 1.0
        world.addComponent(door, new WallOpening("A", 0.25, 0.9, 2.1, 0, 1));
        const before = absX(deps, "A", 0.25);
        expect(before).toBeCloseTo(1.0);

        // Cắt A tại (2,0) → tSplit = 0.5.
        splitWallAt("A", "A2", "nMid", 2, 0, deps);

        const wo = world.getComponent(door, WallOpening)!;
        expect(wo.hostWallId).toBe("A");        // nửa đầu → giữ tường gốc
        expect(wo.t).toBeCloseTo(0.5);          // 0.25 / 0.5
        expect(absX(deps, wo.hostWallId, wo.t)).toBeCloseTo(before); // vị trí TUYỆT ĐỐI giữ nguyên
    });

    it("kệ ở nửa sau: chuyển sang tường mới, vị trí tuyệt đối không đổi", () => {
        const { world, deps } = setup();
        const shelf = world.createEntity();
        // t=0.75 trên tường dài 4 → absX = 3.0
        world.addComponent(shelf, new WallMounted("A", 0.75, 1, 1.3));
        const before = absX(deps, "A", 0.75);
        expect(before).toBeCloseTo(3.0);

        splitWallAt("A", "A2", "nMid", 2, 0, deps);

        const wm = world.getComponent(shelf, WallMounted)!;
        expect(wm.hostWallId).toBe("A2");       // nửa sau → tường mới
        expect(wm.t).toBeCloseTo(0.5);          // (0.75 - 0.5) / 0.5
        expect(absX(deps, wm.hostWallId, wm.t)).toBeCloseTo(before); // vị trí TUYỆT ĐỐI giữ nguyên
    });

    it("cắt lệch tâm (tSplit=0.25): cả hai item giữ vị trí tuyệt đối", () => {
        const { world, deps } = setup();
        const door = world.createEntity();
        const shelf = world.createEntity();
        world.addComponent(door, new WallOpening("A", 0.1, 0.9, 2.1, 0, 1));   // absX = 0.4
        world.addComponent(shelf, new WallMounted("A", 0.6, 1, 1.3));          // absX = 2.4
        const doorBefore = absX(deps, "A", 0.1);
        const shelfBefore = absX(deps, "A", 0.6);

        // Cắt tại (1,0) → tSplit = 0.25.
        splitWallAt("A", "A2", "nMid", 1, 0, deps);

        const wo = world.getComponent(door, WallOpening)!;
        const wm = world.getComponent(shelf, WallMounted)!;
        expect(wo.hostWallId).toBe("A");
        expect(wm.hostWallId).toBe("A2");
        expect(absX(deps, wo.hostWallId, wo.t)).toBeCloseTo(doorBefore);
        expect(absX(deps, wm.hostWallId, wm.t)).toBeCloseTo(shelfBefore);
    });
});
