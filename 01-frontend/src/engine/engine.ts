/**
 * Điểm khởi tạo duy nhất của engine HomeVerse.
 *
 * createEngine() lắp ráp toàn bộ subsystem và trả về EngineInstance.
 *
 * Thứ tự khởi động:
 *   1. Three.js scene / camera / renderer  (sceneSetup)
 *   2. ECS World + NodeRegistry + EventBus
 *   3. Systems đăng ký vào World          (systemSetup)
 *   4. Đèn ambient + directional mặc định
 *   5. Dispatcher + UndoHistory
 *   6. FurniturePlacementSystem
 *   7. Game loop bắt đầu (requestAnimationFrame)
 *
 * Phím tắt toàn cục KHÔNG ở đây — chúng do React (useEditorShortcuts) xử lý.
 *
 * Dependency flow:
 *   Canvas component → createEngine(canvas) → EngineInstance
 *   EngineInstance được mount vào:
 *     - window.gameEngine (backward-compat)
 *     - EngineContext.Provider (React tree)
 */
import { World } from "src/engine/ecs/World";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

import { createScene } from "src/engine/setup/sceneSetup";
import { createSystems } from "src/engine/setup/systemSetup";
import { createDispatcher } from "src/engine/commands/dispatcher";
import { UndoHistory } from "src/engine/commands/history";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { serializeScene } from "src/engine/serialization/serialize";
import { deserializeScene } from "src/engine/serialization/deserialize";
import { createAmbientLight, createDirectionalLight } from "src/engine/game/LightFactory";
import { FurniturePlacementSystem } from "src/engine/systems/FurniturePlacementSystem";
import { Transform } from "src/engine/components/Transform";
import { ColliderAABB } from "src/engine/components/ColliderAABB";
import { StaticBody } from "src/engine/components/StaticBody";

import type { EngineApi, EngineInstance } from "src/engine/engineTypes";
import type { SceneDocument } from "src/engine/serialization/SceneDocument";

// Re-export types so existing imports keep working.
export type { EngineApi, EngineInstance } from "src/engine/engineTypes";

/** Initial value for maxWallIdRef — no default walls are pre-created. */
const INITIAL_NEXT_WALL_ID = 1;

export function createEngine(canvas: HTMLCanvasElement): EngineInstance {
    const { scene, camera, renderer } = createScene(canvas);

    const nodeRegistry = new NodeRegistry();
    const world = new World();
    const events = new EngineEvents();

    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const gltfLoader = new GLTFModelLoader();
    const modelRegistry = new ModelRegistry(scene);
    const entityRegistry = new EntityRegistry(world, meshRegistry, modelRegistry);

    const { orbit, gizmoSystem, collisionSystem, dragGhostController } = createSystems(world, scene, camera, renderer, nodeRegistry, events, meshRegistry, materialRegistry);

    // Headless floor collider — no Mesh so GizmoSystem/RenderSystem ignores it.
    // ColliderAABB(50, 0.5, 50) uses half-extents, matching CannonCollisionSystem convention.
    // Center at Y=-0.5 so the top face sits exactly at Y=0 (world floor level).
    const groundEid = world.createEntity();
    world.addComponent(groundEid, new Transform(0, -0.5, 0));
    world.addComponent(groundEid, new ColliderAABB(50, 0.5, 50));
    world.addComponent(groundEid, new StaticBody());

    // Ambient raised to 0.5 so wall faces away from the sun still read clearly.
    createAmbientLight(world, { intensity: 0.5 });
    createDirectionalLight(world, { x: 10, y: 18, z: 10, intensity: 0.9 });

    // wallEntityByWallId: ánh xạ wallId → ECS entityId — dùng để tra entity từ ID logic
    const wallEntityByWallId = new Map<number, number>();
    // maxWallIdRef: theo dõi wallId lớn nhất đã dùng — mutable ref để dispatcher cập nhật
    const maxWallIdRef = { value: INITIAL_NEXT_WALL_ID - 1 };

    // initDefaultScene(world, scene, nodeRegistry, wallEntityByWallId);

    const dispatch = createDispatcher({ world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry, gltfLoader, modelRegistry, collisionSystem, entityRegistry });

    const placementSystem = new FurniturePlacementSystem(
        scene, camera, renderer.domElement,
        orbit.controls,
        dispatch,
        events,
        gltfLoader,
        collisionSystem,
    );

    // ── Undo / redo state ─────────────────────────────────────────────────────
    // instanceRef: ref vòng — cho phép undo/redo truy cập engineInstance trước khi nó được tạo
    // (engineInstance được gán vào instanceRef.current cuối hàm createEngine)
    const instanceRef: { current: EngineInstance | null } = { current: null };
    const undoHistory = new UndoHistory();
    // pendingLabel/pendingSnapshot: giữ state của beginTransaction() cho đến commitTransaction()
    let pendingLabel: string | null = null;
    let pendingSnapshot: SceneDocument | null = null;

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    let running = true;
    let lastTime = performance.now();
    function loop() {
        if (!running) return;
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        world.update(dt);
        requestAnimationFrame(loop);
    }
    loop();

    const api: EngineApi = {
        events,
        dispatch,
        clampNodeMove: (_nodeId, newX, newZ) => ({ x: newX, z: newZ }),
        getNextIds: () => ({
            nodeId: nodeRegistry.nextAvailableNodeId(),
            wallId: maxWallIdRef.value + 1,
        }),
        setView:    (preset)   => orbit.setView(preset),
        rotateView: (angleDeg) => orbit.rotateBy(angleDeg),
        setGizmoMode: (mode) => gizmoSystem.setGizmoMode(mode),

        transaction(label, fn) {
            const inst = instanceRef.current;
            if (!inst) { fn(); return; }
            const snapshot = serializeScene(inst);
            fn();
            undoHistory.push(label, snapshot);
        },

        beginTransaction(label) {
            const inst = instanceRef.current;
            if (!inst) return;
            pendingLabel = label;
            pendingSnapshot = serializeScene(inst);
        },

        commitTransaction() {
            if (pendingSnapshot !== null && pendingLabel !== null) {
                undoHistory.push(pendingLabel, pendingSnapshot);
            }
            pendingLabel = null;
            pendingSnapshot = null;
        },

        cancelTransaction() {
            pendingLabel = null;
            pendingSnapshot = null;
        },

        undo() {
            const inst = instanceRef.current;
            if (!inst) return;
            const snapshot = undoHistory.undo(serializeScene(inst));
            if (snapshot) deserializeScene(snapshot, inst);
        },

        redo() {
            const inst = instanceRef.current;
            if (!inst) return;
            const snapshot = undoHistory.redo(serializeScene(inst));
            if (snapshot) deserializeScene(snapshot, inst);
        },

        canUndo: () => undoHistory.canUndo(),
        canRedo:  () => undoHistory.canRedo(),

        beginPlacement: (modelId) => placementSystem.begin(modelId),
        cancelPlacement: () => placementSystem.cancel(),
    };

    // Wire GizmoSystem to the transaction + delete API (created after createSystems).
    gizmoSystem.setCommandCallbacks(
        (label) => api.beginTransaction(label),
        () => api.commitTransaction(),
        (entityId) => api.transaction("delete furniture 3D", () => {
            api.dispatch({ type: "DELETE_FURNITURE", entityId });
        }),
    );

    const engineInstance: EngineInstance = {
        world,
        api,
        nodes: nodeRegistry,
        wallEntityByWallId,
        dispose() {
            undoHistory.clear();
            running = false;
            window.removeEventListener("resize", onResize);
            orbit.controls.dispose();
            gizmoSystem.dispose();
            dragGhostController.dispose();
            collisionSystem.dispose();
            placementSystem.dispose();
            gltfLoader.dispose();
            modelRegistry.disposeAll();

            // All wall bodies, cap meshes, and room floor meshes are tracked by MeshRegistry.
            // Materials are shared via MaterialRegistry — release them after all meshes are gone.
            meshRegistry.disposeAll();
            materialRegistry.releaseAll();

            renderer.dispose();
            if (window.gameEngine === engineInstance) delete window.gameEngine;
        },
    };

    instanceRef.current = engineInstance;
    if (import.meta.env.DEV) window.gameEngine = engineInstance;
    return engineInstance;
}
