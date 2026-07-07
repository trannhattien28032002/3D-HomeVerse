/**
 * dragKernels.golden — GOLDEN test cho 3 "kernel" của vùng drag (CỔNG Phase 5).
 *
 * Mục đích: chốt CỨNG hành vi hiện tại của 3 đường wall-item / furniture trước khi
 * refactor (5.1/5.2/5.4/5.5). Mọi PR Phase 5 sau đó CHỈ được THÊM case, KHÔNG đổi
 * kỳ vọng — nếu một bước gộp kernel lỡ làm lệch feel thì test này đỏ ngay.
 *
 * Ba kernel + policy-contract:
 *   1. slideWallItem        (3D gizmo)  — chính sách overlap = SNAP (đẩy ra, không từ chối).
 *   2. handleMoveWallItem   (command)   — chính sách overlap = REJECT (giữ nguyên t cũ).
 *   3. handleFurnitureTranslate (3D)    — teleport-khi-trống / clamp-khi-đụng + ghost.
 *
 * Hai cái đầu dựng World thật (1 tường + cửa/kệ). Cái thứ ba mock collisionSystem /
 * dragGhost (Cannon nặng) để chỉ kiểm orchestration teleport-vs-clamp.
 */
import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { createWall } from "src/engine/factories/WallFactory";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { Model3D } from "src/engine/components/render/Model3D";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { slideWallItem, handleFurnitureTranslate, type FurnitureTranslateCtx } from "src/engine/systems/gizmo/gizmoHandles";
import { handleMoveWallItem } from "src/engine/commands/handlers/furnitureHandlers";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

// modelId thật trong catalog: door-a = opening (w 0.9), wall-shelf-b = mount (w 0.8).
const DOOR = "door-a";
const SHELF = "wall-shelf-b";

/** Dựng World + tường A dọc +X từ (0,0)→(4,0), thickness 0.2 (len = 4). */
function setupWall() {
    const world = new World();
    const scene = new THREE.Scene();
    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const nodeRegistry = new NodeRegistry();
    const wallEntityByWallId = new Map<string, string>();

    nodeRegistry.ensureNode("nA", 0, 0);
    nodeRegistry.ensureNode("nB", 4, 0);
    const entA = createWall(world, scene,
        { wallId: "A", startNodeId: "nA", endNodeId: "nB", thickness: 0.2 },
        meshRegistry, materialRegistry);
    nodeRegistry.connectWall("nA", "A");
    nodeRegistry.connectWall("nB", "A");
    wallEntityByWallId.set("A", entA);

    const deps = {
        world, scene, nodeRegistry, wallEntityByWallId, meshRegistry, materialRegistry,
    } as unknown as DispatcherDeps;

    return { world, nodeRegistry, deps };
}

/** Group có 1 box-mesh để Box3.setFromObject ra bbox thật (cần cho nhánh clamp-Y của kệ). */
function makeModelRoot(w: number, h: number, d: number): THREE.Object3D {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    mesh.position.y = h / 2; // đáy ở y=0 (pivot đáy như GLB)
    root.add(mesh);
    return root;
}

function addDoor(world: World, hostWallId: string, t: number, side = 1): string {
    const e = world.createEntity();
    world.addComponent(e, new WallOpening(hostWallId, t, 0.9, 2.1, 0, side));
    world.addComponent(e, new Model3D(makeModelRoot(0.9, 2.1, 0.12), DOOR));
    return e;
}

function addShelf(world: World, hostWallId: string, t: number, side = 1): string {
    const e = world.createEntity();
    world.addComponent(e, new WallMounted(hostWallId, t, side, 1.3));
    world.addComponent(e, new Model3D(makeModelRoot(0.8, 0.3, 0.25), SHELF));
    return e;
}

// ───────────────────────────────────────────────────────────────────────────
// KERNEL 1 — slideWallItem (3D gizmo): chính sách SNAP
// ───────────────────────────────────────────────────────────────────────────
describe("GOLDEN slideWallItem (gizmo, policy=snap)", () => {
    it("cửa trượt giữa tường trống → t=0.5, không overlap, root bám tim tường", () => {
        const { world, nodeRegistry } = setupWall();
        const door = addDoor(world, "A", 0.25);

        const r = slideWallItem(world, nodeRegistry, door, 2, 0);

        expect(r.success).toBe(true);
        expect(r.isOverlapping).toBe(false);
        const wo = world.getComponent(door, WallOpening)!;
        expect(wo.t).toBeCloseTo(0.5);
        const model = world.getComponent(door, Model3D)!;
        expect(model.root.position.x).toBeCloseTo(2);
        expect(model.root.position.z).toBeCloseTo(0);
    });

    it("kéo cửa quá đầu tường → clamp về maxT (không tràn)", () => {
        const { world, nodeRegistry } = setupWall();
        const door = addDoor(world, "A", 0.5);

        const r = slideWallItem(world, nodeRegistry, door, 5, 0);

        expect(r.success).toBe(true);
        const wo = world.getComponent(door, WallOpening)!;
        // halfWidthT = 0.45/4 = 0.1125 → maxT = 0.8875.
        expect(wo.t).toBeCloseTo(0.8875);
        expect(world.getComponent(door, Model3D)!.root.position.x).toBeCloseTo(3.55);
    });

    it("SNAP: cửa kéo vào chỗ đã có cửa khác → đẩy ra cạnh range, success vẫn true", () => {
        const { world, nodeRegistry } = setupWall();
        addDoor(world, "A", 0.5);              // cửa cố định, range [0.3875, 0.6125], lane 0
        const dragged = addDoor(world, "A", 0.2);

        const r = slideWallItem(world, nodeRegistry, dragged, 2, 0); // muốn t=0.5

        expect(r.success).toBe(true);          // KHÔNG bao giờ reject
        const wo = world.getComponent(dragged, WallOpening)!;
        // Đẩy qua mép phải: r.tMax(0.6125) + halfT(0.1125) = 0.725.
        expect(wo.t).toBeCloseTo(0.725);
        expect(r.isOverlapping).toBe(false);   // tại t cuối đã hết đè
    });

    it("kệ kéo lên cao: clamp đáy trong [sàn, đỉnh tường] + đồng bộ mountHeight", () => {
        const { world, nodeRegistry } = setupWall();
        const shelf = addShelf(world, "A", 0.5, 1);
        const model = world.getComponent(shelf, Model3D)!;
        model.root.position.y = 5; // gizmo kéo lên quá đỉnh tường

        const r = slideWallItem(world, nodeRegistry, shelf, 2, 0);

        expect(r.success).toBe(true);
        const wm = world.getComponent(shelf, WallMounted)!;
        // bbox cao 0.3; mountHeight = centerY = desiredBottom + h/2, desiredBottom clamp ≥ 0.
        expect(wm.mountHeight).toBeGreaterThan(0);
        expect(wm.side).toBe(1);
        // Đáy model không tụt dưới sàn.
        const bbox = new THREE.Box3().setFromObject(model.root);
        expect(bbox.min.y).toBeGreaterThanOrEqual(-1e-6);
    });

    it("thiếu tường host → success=false, không ghi t", () => {
        const { world, nodeRegistry } = setupWall();
        const door = addDoor(world, "GHOST", 0.3);
        const r = slideWallItem(world, nodeRegistry, door, 2, 0);
        expect(r.success).toBe(false);
        expect(world.getComponent(door, WallOpening)!.t).toBeCloseTo(0.3);
    });
});

// ───────────────────────────────────────────────────────────────────────────
// KERNEL 2 — handleMoveWallItem (command): chính sách REJECT
// ───────────────────────────────────────────────────────────────────────────
describe("GOLDEN handleMoveWallItem (command, policy=reject)", () => {
    function move(entityId: string, hostWallId: string, t: number, side: number): EngineCommand {
        return { type: "MOVE_WALL_ITEM", entityId, hostWallId, t, side } as EngineCommand;
    }

    it("tường trống → commit t đã clamp", () => {
        const { world, deps } = setupWall();
        const door = addDoor(world, "A", 0.25);

        handleMoveWallItem(move(door, "A", 0.5, 1) as Extract<EngineCommand, { type: "MOVE_WALL_ITEM" }>, deps);

        expect(world.getComponent(door, WallOpening)!.t).toBeCloseTo(0.5);
    });

    it("REJECT: chồng cửa khác → giữ NGUYÊN t cũ (không snap)", () => {
        const { world, deps } = setupWall();
        addDoor(world, "A", 0.5);                  // cửa chiếm chỗ
        const dragged = addDoor(world, "A", 0.2);

        handleMoveWallItem(move(dragged, "A", 0.5, 1) as Extract<EngineCommand, { type: "MOVE_WALL_ITEM" }>, deps);

        // Khác slideWallItem (snap) — command từ chối, t giữ 0.2.
        expect(world.getComponent(dragged, WallOpening)!.t).toBeCloseTo(0.2);
    });

    it("tường ngắn hơn item (minT≥maxT) → fallback t=0.5 (KHÁC slideWallItem giữ t cũ)", () => {
        // Tường ngắn: dựng riêng len 0.5 < door width 0.9.
        const world = new World();
        const scene = new THREE.Scene();
        const meshRegistry = new MeshRegistry(scene);
        const materialRegistry = new MaterialRegistry();
        const nodeRegistry = new NodeRegistry();
        nodeRegistry.ensureNode("nA", 0, 0);
        nodeRegistry.ensureNode("nB", 0.5, 0);
        const entA = createWall(world, scene,
            { wallId: "S", startNodeId: "nA", endNodeId: "nB", thickness: 0.2 },
            meshRegistry, materialRegistry);
        nodeRegistry.connectWall("nA", "S");
        nodeRegistry.connectWall("nB", "S");
        const deps = { world, nodeRegistry } as unknown as DispatcherDeps;
        void entA;
        const door = addDoor(world, "S", 0.3);

        handleMoveWallItem(
            { type: "MOVE_WALL_ITEM", entityId: door, hostWallId: "S", t: 0.9, side: 1 } as Extract<EngineCommand, { type: "MOVE_WALL_ITEM" }>,
            deps,
        );

        expect(world.getComponent(door, WallOpening)!.t).toBeCloseTo(0.5);
    });
});

// ───────────────────────────────────────────────────────────────────────────
// KERNEL 3 — handleFurnitureTranslate: teleport-vs-clamp + ghost
// ───────────────────────────────────────────────────────────────────────────
describe("GOLDEN handleFurnitureTranslate (teleport/clamp + ghost)", () => {
    function setupCtx(opts: { collides: boolean; clamped: { x: number; y: number; z: number } | null }) {
        const world = new World();
        const entity = world.createEntity();
        const transform = new Transform(0, 0, 0);
        world.addComponent(entity, transform);
        const collider = new ColliderAABB(0.5, 0.5, 0.5); // half-extents
        world.addComponent(entity, collider);

        const object = new THREE.Object3D();
        object.position.set(1, 0.5, 2);

        const collisionSystem = {
            wouldCollide: vi.fn(() => opts.collides),
            clampMovement: vi.fn(() => opts.clamped),
            setSafePos: vi.fn(),
        };
        const dragGhost = { update: vi.fn(), hide: vi.fn() };

        const ctx = {
            world, entity, object, transform, collider,
            collisionSystem: collisionSystem as unknown as FurnitureTranslateCtx["collisionSystem"],
            dragGhost: dragGhost as unknown as FurnitureTranslateCtx["dragGhost"],
            wallSegments: [], neighbors: [], updateGuide: vi.fn(),
        } as FurnitureTranslateCtx;

        return { ctx, transform, object, collisionSystem, dragGhost };
    }

    it("trống → teleport tới con trỏ, setSafePos + ghost.hide", () => {
        const { ctx, transform, object, collisionSystem, dragGhost } = setupCtx({ collides: false, clamped: null });

        handleFurnitureTranslate(ctx);

        expect(transform.x).toBeCloseTo(1);
        expect(transform.z).toBeCloseTo(2);
        expect(object.position.x).toBeCloseTo(1);
        expect(object.position.z).toBeCloseTo(2);
        expect(collisionSystem.setSafePos).toHaveBeenCalledTimes(1);
        expect(dragGhost.hide).toHaveBeenCalledTimes(1);
        expect(dragGhost.update).not.toHaveBeenCalled();
    });

    it("đụng → clamp tại vật cản, ghost.update(true) ở con trỏ", () => {
        const { ctx, transform, object, collisionSystem, dragGhost } = setupCtx({
            collides: true, clamped: { x: 0.7, y: 0.5, z: 1.5 },
        });

        handleFurnitureTranslate(ctx);

        expect(transform.x).toBeCloseTo(0.7);
        expect(transform.z).toBeCloseTo(1.5);
        expect(object.position.x).toBeCloseTo(0.7);
        expect(object.position.z).toBeCloseTo(1.5);
        expect(dragGhost.update).toHaveBeenCalledTimes(1);
        expect(dragGhost.update.mock.calls[0][1]).toBe(true); // visible=true
        expect(dragGhost.hide).not.toHaveBeenCalled();
        expect(collisionSystem.setSafePos).not.toHaveBeenCalled();
    });
});
