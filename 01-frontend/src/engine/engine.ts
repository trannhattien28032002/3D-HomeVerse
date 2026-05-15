/**
 * Điểm khởi tạo duy nhất của engine HomeVerse.
 *
 * createEngine() lắp ráp toàn bộ subsystem và trả về EngineInstance.
 *
 * Thứ tự khởi động:
 *   1. Three.js scene / camera / renderer  (sceneSetup)
 *   2. ECS World + NodeRegistry + EventBus
 *   3. Systems đăng ký vào World          (systemSetup)
 *   4. InputSystem lắng nghe phím tắt toàn cục
 *   5. Đèn ambient + directional mặc định
 *   6. Dispatcher + UndoHistory
 *   7. Game loop bắt đầu (requestAnimationFrame)
 *
 * Dependency flow:
 *   Canvas component → createEngine(canvas) → EngineInstance
 *   EngineInstance được mount vào:
 *     - window.gameEngine (backward-compat)
 *     - EngineContext.Provider (React tree)
 */
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

import { createScene } from "src/engine/setup/sceneSetup";
import { createSystems } from "src/engine/setup/systemSetup";
import { initDefaultScene, INITIAL_NEXT_WALL_ID } from "src/engine/setup/defaultScene";
import { createDispatcher } from "src/engine/commands/dispatcher";
import { UndoHistory } from "src/engine/commands/history";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { serializeScene } from "src/engine/serialization/serialize";
import { deserializeScene } from "src/engine/serialization/deserialize";
import { createAmbientLight, createDirectionalLight } from "src/engine/game/LightFactory";
import { InputSystem } from "src/engine/systems/InputSystem";

import type { EngineApi, EngineInstance } from "src/engine/engineTypes";
import type { SceneDocument } from "src/engine/serialization/SceneDocument";

// Re-export types and constants so existing imports keep working.
export type { EngineApi, EngineInstance } from "src/engine/engineTypes";
export { INITIAL_NEXT_NODE_ID, INITIAL_NEXT_WALL_ID } from "src/engine/setup/defaultScene";

export function createEngine(canvas: HTMLCanvasElement): EngineInstance {
    const { scene, camera, renderer } = createScene(canvas);

    const nodeRegistry = new NodeRegistry();
    const world = new World();
    const events = new EngineEvents();

    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();

    const { orbit, gizmoSystem, collisionSystem } = createSystems(world, scene, camera, renderer, nodeRegistry, events, meshRegistry, materialRegistry);
    const inputSystem = new InputSystem();

    // Ambient raised to 0.5 so wall faces away from the sun still read clearly.
    createAmbientLight(world, { intensity: 0.5 });
    createDirectionalLight(world, { x: 10, y: 18, z: 10, intensity: 0.9 });

    // wallEntityByWallId: ánh xạ wallId → ECS entityId — dùng để tra entity từ ID logic
    const wallEntityByWallId = new Map<number, number>();
    // maxWallIdRef: theo dõi wallId lớn nhất đã dùng — mutable ref để dispatcher cập nhật
    const maxWallIdRef = { value: INITIAL_NEXT_WALL_ID - 1 };

    // initDefaultScene(world, scene, nodeRegistry, wallEntityByWallId);

    const dispatch = createDispatcher({ world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry });

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
    };

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
            collisionSystem.dispose();
            inputSystem.dispose();

            // All wall bodies, cap meshes, and room floor meshes are tracked by MeshRegistry.
            // Materials are shared via MaterialRegistry — release them after all meshes are gone.
            meshRegistry.disposeAll();
            materialRegistry.releaseAll();

            renderer.dispose();
            if (window.gameEngine === engineInstance) delete window.gameEngine;
        },
    };

    instanceRef.current = engineInstance;
    window.gameEngine = engineInstance;
    return engineInstance;
}
