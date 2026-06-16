import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { GhostMaterialSet } from "src/engine/rendering/GhostMaterials";
import { createGuideLine, setGuideLine, disposeGuideLine } from "src/engine/rendering/guideLine";
import { getAssetPath, getBoundingBox, getPlacement, type PlacementSpec } from "src/engine/catalog/FurnitureCatalog";
import { resolveCollisionFootprint } from "src/engine/catalog/footprint";
import type { ModelTemplate } from "src/engine/rendering/GLTFModelLoader";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import { WallItemGhost } from "src/engine/systems/placement/WallItemGhost";
import type { World } from "src/engine/ecs/World";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { RenderScheduler } from "src/engine/rendering/RenderScheduler";

/**
 * FurniturePlacementSystem — chế độ đặt nội thất bằng ghost xem-trước trong 3D.
 *
 * begin(modelId): nạp GLB, tạo bản clone trong suốt (ghost) bám theo con trỏ trên
 * mặt sàn (snap lưới). Ghost chuyển đỏ khi vị trí bị va chạm. Click trái xác nhận
 * (dispatch PLACE_FURNITURE), click phải/ESC huỷ. Footprint va chạm của ghost dùng
 * chung helper với lúc spawn thật để khớp tuyệt đối.
 *
 * Lưu ý: không phải ECS System (không có update mỗi frame) — hoạt động theo sự kiện
 * chuột, được createEngine tạo và quản lý vòng đời.
 */
export class FurniturePlacementSystem {
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.Camera;
    private readonly domElement: HTMLElement;
    private readonly orbitControls: OrbitControls;
    private readonly dispatchAsync: (cmd: EngineCommand) => Promise<void>;
    private readonly asyncTransaction: (label: string, fn: () => Promise<void>) => Promise<void>;
    private readonly events: EngineEvents;
    private readonly loader: GLTFModelLoader;
    private readonly collisionSystem: CannonCollisionSystem;
    private readonly world: World;
    private readonly nodeRegistry: NodeRegistry;
    /** On-demand render (CR-03): ghost bám con trỏ KHÔNG bump revision → tự báo cần vẽ. */
    private readonly scheduler?: RenderScheduler;

    /** Đường gióng wall-snap (sát sàn), ẩn cho tới khi mép ghost áp tường. */
    private readonly guideLine: THREE.Line;
    /** Tường gom 1 lần khi vào chế độ đặt (tĩnh trong phiên đặt). */
    private wallSegments: WallSegment[] = [];
    /** Footprint đồ lân cận gom 1 lần khi vào chế độ đặt (cho neighbor-align). */
    private furnitureBoxes: FurnitureBox[] = [];

    private active = false;
    private modelId: string | null = null;
    private template: ModelTemplate | null = null;
    private ghostRoot: THREE.Group | null = null;
    private isColliding = false;

    /** Ràng buộc đặt của model hiện tại (floor mặc định). */
    private placement: PlacementSpec | null = null;
    /** Offset Y gốc của ghost sau chuẩn-hoá-pivot (đáy ở world 0 khi position.y = offset). */
    private ghostBaseOffsetY = 0;
    /** Vật liệu ghost (clone trong suốt + tint va chạm) — dùng chung với DragGhostController. */
    private ghostMaterialSet: GhostMaterialSet | null = null;
    /** Luồng ghost bám tường (cửa/cửa sổ/kệ) — sở hữu wallHit + preview CSG. */
    private readonly wallItemGhost: WallItemGhost;

    private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private readonly raycaster = new THREE.Raycaster();
    private readonly ndc = new THREE.Vector2();
    private readonly hitPoint = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        camera: THREE.Camera,
        domElement: HTMLElement,
        orbitControls: OrbitControls,
        events: EngineEvents,
        loader: GLTFModelLoader,
        collisionSystem: CannonCollisionSystem,
        world: World,
        nodeRegistry: NodeRegistry,
        asyncTransaction: (label: string, fn: () => Promise<void>) => Promise<void>,
        dispatchAsync: (cmd: EngineCommand) => Promise<void>,
        scheduler?: RenderScheduler,
    ) {
        this.scheduler = scheduler;
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.orbitControls = orbitControls;
        this.dispatchAsync = dispatchAsync;
        this.asyncTransaction = asyncTransaction;
        this.events = events;
        this.loader = loader;
        this.collisionSystem = collisionSystem;
        this.world = world;
        this.nodeRegistry = nodeRegistry;
        this.wallItemGhost = new WallItemGhost({
            world,
            nodeRegistry,
            raycaster: this.raycaster,
            scene,
            setColliding: this.setColliding,
            hideGuide: () => { this.guideLine.visible = false; },
        });

        this.guideLine = createGuideLine(this.scene); // đường gióng dùng chung (L5)
    }

    /** Vào chế độ đặt cho model cho trước. Huỷ phiên đặt đang chạy (nếu có) trước. */
    begin(modelId: string): void {
        if (this.active) this.cleanup();

        this.active = true;
        this.modelId = modelId;
        this.placement = getPlacement(modelId);
        // Gom tường + đồ lân cận 1 lần (tĩnh trong phiên đặt) cho snap.
        this.wallSegments = collectWallSegments(this.world, this.nodeRegistry);
        this.furnitureBoxes = collectFurnitureBoxes(this.world);
        // Item bám tường: gom mesh tường để raycast (gắn ngược entity id).
        if (this.placement.constraint === "wall") {
            this.wallItemGhost.collectWalls();
        }

        // Tắt orbit để camera không xoay khi click/kéo trong lúc đặt.
        this.orbitControls.enabled = false;

        // Dùng capture phase để chặn TRƯỚC listener bubble-phase của GizmoSystem.
        this.domElement.addEventListener("mousemove", this.onMouseMove);
        this.domElement.addEventListener("mousedown", this.onMouseDown, { capture: true });
        this.domElement.addEventListener("contextmenu", this.onContextMenu, { capture: true });

        this.events.emit("placementStarted", { modelId });
        this.events.emit("placementLoading", { modelId });

        let assetPath: string;
        try {
            assetPath = getAssetPath(modelId);
        } catch (err) {
            this.events.emit("placementError", { modelId, error: String(err) });
            this.cleanup();
            return;
        }

        this.loader.load(assetPath, getBoundingBox(modelId)).then((template) => {
            // Guard: phiên đặt có thể đã bị huỷ trong lúc GLB đang nạp.
            if (!this.active || this.modelId !== modelId) return;
            this.template = template;

            const ghost = template.scene.clone(true) as THREE.Group;

            // Vật liệu ghost trong suốt + cache tint (dùng chung DragGhostController).
            this.ghostMaterialSet = GhostMaterialSet.apply(ghost);

            ghost.visible = false;
            // Offset Y gốc (đáy-ở-world-0) — wall-ghost cộng baseY lên trên giá trị này.
            this.ghostBaseOffsetY = ghost.position.y;
            this.scene.add(ghost);
            this.ghostRoot = ghost;
            this.events.emit("placementReady", { modelId });
            this.scheduler?.requestRender();
        }).catch((err) => {
            this.events.emit("placementError", { modelId, error: String(err) });
            this.cleanup();
        });
    }

    /** Huỷ phiên đặt và gỡ ghost. */
    cancel(): void {
        if (!this.active) return;
        this.cleanup();
        this.events.emit("placementCancelled", {});
    }

    private confirm(x: number, z: number): void {
        const modelId = this.modelId!;
        this.cleanup();
        // asyncTransaction: snapshot chụp TRƯỚC → await spawn → push history.
        // Đảm bảo undo sau placement xóa được entity (R1 fix).
        this.asyncTransaction("place furniture", () =>
            this.dispatchAsync({ type: "PLACE_FURNITURE", modelId, x, z, rotY: 0 }),
        ).catch(err => console.error("[FurniturePlacementSystem] confirm failed:", err));
        this.events.emit("placementConfirmed", { modelId, x, z });
    }

    private confirmWallItem(hostWallId: string, t: number, side: number): void {
        const modelId = this.modelId!;
        const x = this.ghostRoot?.position.x ?? 0;
        const z = this.ghostRoot?.position.z ?? 0;
        this.cleanup();
        // asyncTransaction: snapshot chụp TRƯỚC → await spawn → push history.
        // Đảm bảo undo sau placement xóa được entity (R1 fix).
        this.asyncTransaction("place wall item", () =>
            this.dispatchAsync({ type: "PLACE_WALL_ITEM", modelId, hostWallId, t, side }),
        ).catch(err => console.error("[FurniturePlacementSystem] confirmWallItem failed:", err));
        this.events.emit("placementConfirmed", { modelId, x, z });
    }

    private cleanup(): void {
        // Dọn state wall-ghost (preview CSG + gỡ __wallEntity + wallHit) trước khi gỡ ghost.
        this.wallItemGhost.reset();

        if (this.ghostRoot) {
            this.scene.remove(this.ghostRoot);
            // Chỉ dispose vật liệu đã clone — KHÔNG dispose geometry dùng chung
            // (geometry nằm trong cache của GLTFModelLoader, tái dùng cho mọi clone).
            GhostMaterialSet.disposeClonedMaterials(this.ghostRoot);
            this.ghostRoot = null;
        }
        this.domElement.removeEventListener("mousemove", this.onMouseMove);
        this.domElement.removeEventListener("mousedown", this.onMouseDown, { capture: true });
        this.domElement.removeEventListener("contextmenu", this.onContextMenu, { capture: true });
        this.orbitControls.enabled = true;
        this.template = null;
        this.isColliding = false;
        this.ghostMaterialSet = null;
        this.wallSegments = [];
        this.furnitureBoxes = [];
        this.guideLine.visible = false;
        this.active = false;
        this.modelId = null;
        this.placement = null;
        this.ghostBaseOffsetY = 0;
        // Ghost vừa bị gỡ (huỷ đặt không bump revision) → vẽ lại để ghost biến mất.
        this.scheduler?.requestRender();
    }

    /** Đặt trạng thái va chạm + tint ghost (dedup theo isColliding). Dùng chung floor & wall. */
    private setColliding = (colliding: boolean): void => {
        if (colliding === this.isColliding) return;
        this.isColliding = colliding;
        this.ghostMaterialSet?.setColliding(colliding);
    };

    private onMouseMove = (e: MouseEvent): void => {
        const ghost = this.ghostRoot;
        if (!ghost) return;
        // Ghost di chuyển theo con trỏ không bump revision → báo cần vẽ lại frame này.
        this.scheduler?.requestRender();
        const rect = this.domElement.getBoundingClientRect();
        this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.ndc, this.camera);
        if (!this.template || !this.modelId) return; // ghost chỉ tồn tại khi template đã nạp

        // Item bám tường: uỷ cho WallItemGhost (raycast mặt tường thay vì mặt sàn).
        if (this.placement?.constraint === "wall") {
            this.wallItemGhost.update({
                ghost,
                template: this.template,
                modelId: this.modelId,
                placement: this.placement,
                ghostBaseOffsetY: this.ghostBaseOffsetY,
            });
            return;
        }

        if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hitPoint)) return;

        // Dùng helper chuỗi-ưu-tiên dùng chung để footprint ghost luôn khớp entity
        // được spawn (tier 1: _col mesh, tier 2: JSON, tier 3: AABB hiển thị).
        const fp = resolveCollisionFootprint(this.modelId, this.template);

        // Snap qua nguồn chân lý chung: edge-snap lưới + wall-snap (rotY=0 khi đặt mới).
        const aligned = resolveAlignment({
            cx: this.hitPoint.x, cz: this.hitPoint.z,
            hw: fp.width / 2, hd: fp.depth / 2, rotY: 0,
            walls: this.wallSegments,
            neighbors: this.furnitureBoxes,
        });
        ghost.position.x = aligned.x;
        ghost.position.z = aligned.z;
        ghost.visible = true;
        this.updateGuide(aligned.guides);

        const testY = fp.height / 2;
        const colliding = this.collisionSystem.wouldCollideCustom(
            ghost.position.x, testY, ghost.position.z,
            fp.width, fp.depth, fp.height, 0, 0, 0, 1,
        );
        this.setColliding(colliding);
    };

    /** Vẽ đường gióng wall-snap (sát sàn); ẩn nếu không có. */
    private updateGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        setGuideLine(this.guideLine, guides);
    }

    private onMouseDown = (e: MouseEvent): void => {
        if (!this.active) return;
        e.stopPropagation();
        if (e.button === 0) {
            // Item bám tường: chỉ đặt khi có wallHit hợp lệ.
            if (this.placement?.constraint === "wall") {
                const hit = this.wallItemGhost.hit;
                if (!hit) return;
                this.confirmWallItem(hit.hostWallId, hit.t, hit.side);
                return;
            }
            if (this.isColliding) return;
            const x = this.ghostRoot?.position.x ?? 0;
            const z = this.ghostRoot?.position.z ?? 0;
            this.confirm(x, z);
        } else if (e.button === 2) {
            this.cancel();
        }
    };

    private onContextMenu = (e: MouseEvent): void => {
        if (!this.active) return;
        e.preventDefault();
        e.stopPropagation();
    };

    dispose(): void {
        this.cleanup();
        disposeGuideLine(this.scene, this.guideLine);
    }
}
