/**
 * systemSetup — đăng ký toàn bộ ECS System vào World theo ĐÚNG thứ tự chạy.
 *
 * Thứ tự rất quan trọng vì system sau phụ thuộc kết quả system trước trong cùng frame:
 *   OrbitControl → Gizmo → Collision → Light →
 *   WallGeometry → Room → Dimension → Render → Snapshot
 * (Snap/align nội thất KHÔNG còn là System — đã hợp nhất vào shared/geometry/alignment
 *  gọi trực tiếp từ các đường nhập 2D/3D. Xem SNAP-M-NEXT-STEPS-PLAN.md.)
 * Đặc biệt: WallGeometry (dựng hình tường) phải chạy TRƯỚC Dimension/Snapshot
 * (đọc hình tường), và Snapshot chạy CUỐI để emit trạng thái đã hoàn chỉnh cho UI.
 * CollisionDebugSystem chỉ thêm ở chế độ DEV.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { World } from "src/engine/ecs/World";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

import { OrbitControlSystem } from "src/engine/systems/scene/OrbitControlSystem";
import { GizmoSystem } from "src/engine/systems/gizmo/GizmoSystem";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import { LightSystem } from "src/engine/systems/scene/LightSystem";
import { WallGeometrySystem } from "src/engine/systems/wall/WallGeometrySystem";
import { WallMountSystem } from "src/engine/systems/wall/WallMountSystem";
import { WallOpeningSystem } from "src/engine/systems/wall/WallOpeningSystem";
import { RoomSystem } from "src/engine/systems/annotation/RoomSystem";
import { RenderSystem } from "src/engine/systems/scene/RenderSystem";
import { DimensionSystem } from "src/engine/systems/annotation/DimensionSystem";
import { SnapshotSystem } from "src/engine/systems/sync/SnapshotSystem";
import { CollisionDebugSystem } from "src/engine/systems/collision/CollisionDebugSystem";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import { RenderScheduler } from "src/engine/rendering/RenderScheduler";
import { createPostprocessing } from "src/engine/setup/postprocessSetup";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";

export type SystemBundle = {
    orbit: OrbitControlSystem;
    gizmoSystem: GizmoSystem;
    collisionSystem: CannonCollisionSystem;
    dragGhostController: DragGhostController;
    /** Pipeline hậu kỳ (RenderPass→OutlinePass→OutputPass) — engine resize/dispose. */
    composer: EffectComposer;
    /** Pass viền chọn — SelectionHighlight cập nhật selectedObjects. */
    outlinePass: OutlinePass;
    /** Cờ on-demand render (CR-03) — engine chuyển cho SelectionHighlight/Placement + resize. */
    renderScheduler: RenderScheduler;
};

export function createSystems(
    world: World,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    nodeRegistry: NodeRegistry,
    events: EngineEvents,
    meshRegistry: MeshRegistry,
    materialRegistry: MaterialRegistry,
    materialLibrary: MaterialLibrary,
    floorMaterials: Map<string, string>,
): SystemBundle {
    const renderScheduler = new RenderScheduler();

    const orbit = new OrbitControlSystem(camera, renderer, scene);
    world.addSystem(orbit);

    const collisionSystem = new CannonCollisionSystem();
    const dragGhostController = new DragGhostController(scene);

    // Scene phủ riêng cho gizmo — render SAU composer nên OutlinePass KHÔNG bắt được
    // gizmo (TransformControls tự bật lại visible handle trong updateMatrixWorld, sẽ lọt
    // vào mask outline nếu nằm chung scene chính). Xem RenderSystem + GizmoSystem.
    const overlayScene = new THREE.Scene();

    const gizmoSystem = new GizmoSystem(camera, scene, renderer, orbit.controls as OrbitControls, nodeRegistry, meshRegistry, overlayScene, events, collisionSystem, dragGhostController, renderScheduler);
    world.addSystem(gizmoSystem);

    world.addSystem(collisionSystem);

    world.addSystem(new LightSystem(scene));
    world.addSystem(new WallGeometrySystem(nodeRegistry, scene, meshRegistry, materialRegistry));
    // WallMount sau WallGeometry: tường đã cập nhật node/hình trước khi item bám theo.
    world.addSystem(new WallMountSystem(nodeRegistry));
    // WallOpening sau WallGeometry: cần WallPolygon đã dựng để khoét lỗ CSG.
    world.addSystem(new WallOpeningSystem(nodeRegistry));
    world.addSystem(new RoomSystem(nodeRegistry, scene, meshRegistry, materialRegistry, materialLibrary, floorMaterials));

    const dimensionSystem = new DimensionSystem(nodeRegistry);
    world.addSystem(dimensionSystem);

    const { composer, outlinePass } = createPostprocessing(renderer, scene, camera);
    world.addSystem(new RenderSystem(composer, renderer, camera, overlayScene, outlinePass, scene, renderScheduler));
    world.addSystem(new SnapshotSystem(events, nodeRegistry, dimensionSystem));

    if (import.meta.env.DEV) {
        world.addSystem(new CollisionDebugSystem(scene));
    }

    return { orbit, gizmoSystem, collisionSystem, dragGhostController, composer, outlinePass, renderScheduler };
}
