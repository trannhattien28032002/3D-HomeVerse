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
 *   5. Dispatcher + UndoHistory + asyncTransactionFn
 *   6. FurniturePlacementSystem (nhận asyncTransactionFn + dispatchAsync)
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
import { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import { disposeSurfaceMaterials } from "src/engine/rendering/surfaceMaterial";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { SelectionHighlight } from "src/engine/rendering/SelectionHighlight";
import { serializeScene } from "src/engine/serialization/serialize";
import { deserializeScene } from "src/engine/serialization/deserialize";
import { createAmbientLight, createDirectionalLight } from "src/engine/game/LightFactory";
import { FurniturePlacementSystem } from "src/engine/systems/placement/FurniturePlacementSystem";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { Model3D } from "src/engine/components/render/Model3D";
import { SurfaceMaterial } from "src/engine/components/render/SurfaceMaterial";
import { v4 as uuidv4 } from "uuid";

import type { EngineApi, EngineInstance } from "src/engine/engineTypes";
import type { SceneDocument } from "src/engine/serialization/SceneDocument";

// Re-export type để các import cũ vẫn hoạt động.
export type { EngineApi, EngineInstance } from "src/engine/engineTypes";

export function createEngine(canvas: HTMLCanvasElement): EngineInstance {
    const { scene, camera, renderer } = createScene(canvas);

    const nodeRegistry = new NodeRegistry();
    const world = new World();
    const events = new EngineEvents();

    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const materialLibrary = new MaterialLibrary(renderer);
    const gltfLoader = new GLTFModelLoader();
    const modelRegistry = new ModelRegistry(scene);
    const entityRegistry = new EntityRegistry(world, meshRegistry, modelRegistry);

    // Material sàn theo roomKey (sorted nodeIds) — shared giữa RoomSystem (re-apply
    // khi dựng lại floor mesh) và dispatcher (SET_FLOOR_MATERIAL ghi vào).
    const floorMaterials = new Map<string, string>();

    const { orbit, gizmoSystem, collisionSystem, dragGhostController, composer, outlinePass } = createSystems(world, scene, camera, renderer, nodeRegistry, events, meshRegistry, materialRegistry, materialLibrary, floorMaterials);

    // Collider sàn "headless" — không có Mesh nên GizmoSystem/RenderSystem bỏ qua.
    // ColliderAABB(50, 0.5, 50) dùng half-extent, đúng quy ước của CannonCollisionSystem.
    // Tâm Y=-0.52 → MẶT TRÊN ở Y=-0.02 (thấp hơn mặt sàn thế giới Y=0 một khe 2cm).
    // Lý do: đồ đặt trên sàn có ĐÁY collider ≈ Y=0; nếu mặt sàn trùng khít Y=0 thì box-box
    // chạm-khít bị tính là va chạm → đồ kê sát sàn (nhất là giường, đáy ~Y=0) luôn bị tô đỏ
    // khi kéo. Hạ 2cm tạo khe an toàn lớn hơn sai số float, nhưng sàn VẪN là collider thật
    // chặn vật rơi xuống dưới sàn.
    const groundEid = world.createEntity();
    world.addComponent(groundEid, new Transform(0, -0.52, 0));
    world.addComponent(groundEid, new ColliderAABB(50, 0.5, 50));
    world.addComponent(groundEid, new StaticBody());

    // Ambient nâng lên 0.5 để mặt tường quay lưng với mặt trời vẫn đủ sáng để nhìn rõ.
    createAmbientLight(world, { intensity: 0.5 });
    createDirectionalLight(world, { x: 10, y: 18, z: 10, intensity: 0.9 });

    // wallEntityByWallId: ánh xạ wallId (uuid) → ECS entityId (uuid) — tra entity từ ID logic
    const wallEntityByWallId = new Map<string, string>();

    // Viền chọn 3D: đồng bộ OutlinePass.selectedObjects theo event chọn (đồ/tường/sàn),
    // đổi màu viền theo loại để người dùng biết đang chọn gì.
    const selectionHighlight = new SelectionHighlight(outlinePass, world, wallEntityByWallId, meshRegistry, events);

    // initDefaultScene(world, scene, nodeRegistry, wallEntityByWallId);

    const { dispatch, dispatchAsync } = createDispatcher({ world, scene, nodeRegistry, wallEntityByWallId, meshRegistry, materialRegistry, materialLibrary, gltfLoader, modelRegistry, collisionSystem, entityRegistry, floorMaterials });

    // ── Undo / redo state ─────────────────────────────────────────────────────
    // instanceRef: ref vòng — cho phép undo/redo truy cập engineInstance trước khi nó được tạo
    // (engineInstance được gán vào instanceRef.current cuối hàm createEngine)
    const instanceRef: { current: EngineInstance | null } = { current: null };
    const undoHistory = new UndoHistory();
    // pendingLabel/pendingSnapshot: giữ state của beginTransaction() cho đến commitTransaction()
    let pendingLabel: string | null = null;
    let pendingSnapshot: SceneDocument | null = null;

    // asyncTransactionFn — snapshot trước → await fn → push history.
    // Khai báo SAU instanceRef/undoHistory để closure capture đúng.
    // Dùng cho PLACE_FURNITURE / PLACE_WALL_ITEM (placement async undo-safe).
    const asyncTransactionFn = async (label: string, fn: () => Promise<void>): Promise<void> => {
        const inst = instanceRef.current;
        if (!inst) { await fn(); return; }
        const snapshot = serializeScene(inst);
        await fn();
        undoHistory.push(label, snapshot);
    };

    const placementSystem = new FurniturePlacementSystem(
        scene, camera, renderer.domElement,
        orbit.controls,
        events,
        gltfLoader,
        collisionSystem,
        world,
        nodeRegistry,
        asyncTransactionFn,
        dispatchAsync,
    );

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        // Composer (+ OutlinePass) phải đồng bộ kích thước, nếu không viền lệch vị trí.
        composer.setSize(window.innerWidth, window.innerHeight);
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
        dispatchAsync,
        clampNodeMove: (_nodeId, newX, newZ) => ({ x: newX, z: newZ }),
        getNextIds: () => ({
            nodeId: nodeRegistry.newNodeId(),
            wallId: uuidv4(),
        }),
        setView: (preset) => orbit.setView(preset),
        rotateView: (angleDeg) => orbit.rotateBy(angleDeg),
        setGizmoMode: (mode) => gizmoSystem.setGizmoMode(mode),
        clearSelection: () => gizmoSystem.clearSelection(),

        captureScreenshot: () => {
            // Bỏ chọn trước → ảnh sạch (không gizmo, không viền chọn).
            gizmoSystem.clearSelection();
            // Renderer KHÔNG bật preserveDrawingBuffer nên drawing buffer bị xoá sau khi
            // trình duyệt composite. Phải render 1 frame rồi đọc canvas NGAY trong cùng
            // tick đồng bộ, trước khi control trả về trình duyệt — nếu không ảnh sẽ đen.
            composer.render();
            return renderer.domElement.toDataURL("image/png");
        },

        transaction(label, fn) {
            const inst = instanceRef.current;
            if (!inst) { fn(); return; }
            const snapshot = serializeScene(inst);
            fn();
            undoHistory.push(label, snapshot);
        },

        asyncTransaction: asyncTransactionFn,

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
            const result = undoHistory.undo(serializeScene(inst));
            if (!result) return;
            if (result.kind === "snapshot") {
                // deserializeScene async (C1) — fire-and-forget; generation guard bên trong
                // xử lý undo/redo nhanh liên tiếp. Chỉ log nếu lỗi.
                void deserializeScene(result.snapshot, inst).catch(err => console.error("[engine] undo deserialize failed:", err));
            } else {
                // Command-inverse: dispatch ngược lại (không teardown mesh).
                dispatch(result.command);
            }
        },

        redo() {
            const inst = instanceRef.current;
            if (!inst) return;
            const result = undoHistory.redo(serializeScene(inst));
            if (!result) return;
            if (result.kind === "snapshot") {
                void deserializeScene(result.snapshot, inst).catch(err => console.error("[engine] redo deserialize failed:", err));
            } else {
                dispatch(result.command);
            }
        },

        canUndo: () => undoHistory.canUndo(),
        canRedo: () => undoHistory.canRedo(),

        recordMoveUndo(entityId, fromX, fromZ, toX, toZ) {
            undoHistory.pushInverse(
                "move furniture",
                { type: "MOVE_FURNITURE", entityId, x: fromX, z: fromZ },
                { type: "MOVE_FURNITURE", entityId, x: toX, z: toZ },
            );
        },

        recordRotateUndo(entityId, fromRotY, toRotY) {
            undoHistory.pushInverse(
                "rotate furniture",
                { type: "ROTATE_FURNITURE", entityId, rotY: fromRotY },
                { type: "ROTATE_FURNITURE", entityId, rotY: toRotY },
            );
        },

        recordWallItemMoveUndo(entityId, fromHostWallId, fromT, fromSide, toHostWallId, toT, toSide) {
            undoHistory.pushInverse(
                "move wall item",
                { type: "MOVE_WALL_ITEM", entityId, hostWallId: fromHostWallId, t: fromT, side: fromSide },
                { type: "MOVE_WALL_ITEM", entityId, hostWallId: toHostWallId, t: toT, side: toSide },
            );
        },

        beginPlacement: (modelId) => placementSystem.begin(modelId),
        cancelPlacement: () => placementSystem.cancel(),

        getEntityMaterials(entityId) {
            const model = world.getComponent(entityId, Model3D);
            if (!model?.materialOverrides) return {};
            const out: Record<string, string> = {};
            for (const [slotId, override] of model.materialOverrides) {
                if (override.variantId) out[slotId] = override.variantId;
            }
            return out;
        },

        getWallMaterial(wallId, face) {
            const entityId = wallEntityByWallId.get(wallId);
            if (!entityId) return null;
            return world.getComponent(entityId, SurfaceMaterial)?.faces[face] ?? null;
        },

        getFloorMaterial(roomKey) {
            return floorMaterials.get(roomKey) ?? null;
        },
    };

    // Nối GizmoSystem vào API transaction + delete (tạo sau createSystems).
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
        materialLibrary,
        floorMaterials,
        dispose() {
            undoHistory.clear();
            running = false;
            window.removeEventListener("resize", onResize);
            selectionHighlight.dispose();
            composer.dispose();
            orbit.controls.dispose();
            gizmoSystem.dispose();
            dragGhostController.dispose();
            collisionSystem.dispose();
            placementSystem.dispose();
            gltfLoader.dispose();
            modelRegistry.disposeAll();

            // Mọi mesh tường, cap, và sàn phòng đều do MeshRegistry quản lý.
            // Vật liệu dùng chung qua MaterialRegistry — giải phóng sau khi mọi mesh đã biến mất.
            meshRegistry.disposeAll();
            materialRegistry.releaseAll();
            materialLibrary.dispose();
            disposeSurfaceMaterials();

            renderer.dispose();
            if (window.gameEngine === engineInstance) delete window.gameEngine;
        },
    };

    instanceRef.current = engineInstance;
    // R9 (L1): DEV-only escape hatch. import.meta.env.DEV is statically false in
    // production builds (Vite replaces it at build time) → dead-code eliminated.
    // Confirmed: window.gameEngine is NOT reachable in production bundles.
    if (import.meta.env.DEV) window.gameEngine = engineInstance;
    return engineInstance;
}
