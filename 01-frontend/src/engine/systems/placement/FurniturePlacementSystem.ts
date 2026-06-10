import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { GhostMaterialSet } from "src/engine/rendering/GhostMaterials";
import { getAssetPath, getBoundingBox, getFootprint2D, getPlacement, type PlacementSpec } from "src/engine/catalog/FurnitureCatalog";
import { resolveCollisionFootprint } from "src/engine/catalog/footprint";
import type { ModelTemplate } from "src/engine/rendering/GLTFModelLoader";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { projectPointToWall, wallItemPose, wallItemOverlaps, occupancyLane, type MountWall } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { collectOccupiedRanges } from "src/engine/systems/gizmo/gizmoHandles";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import { Query } from "src/engine/ecs/Query";
import { Mesh } from "src/engine/components/render/Mesh";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallOpeningPreview } from "src/engine/systems/wall/WallOpeningPreview";
import type { World } from "src/engine/ecs/World";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/** Mesh tường có gắn ngược entity id để truy ngược wallId từ kết quả raycast. */
type WallPickMesh = THREE.Object3D & { __wallEntity?: string };

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
    /** Mesh tường để raycast khi đặt item bám tường (gom 1 lần lúc begin). */
    private wallPickMeshes: WallPickMesh[] = [];
    /** Kết quả bám tường hợp lệ hiện tại (null = chưa hợp lệ → chặn đặt). */
    private wallHit: { hostWallId: string; t: number; side: number } | null = null;
    /** Vật liệu ghost (clone trong suốt + tint va chạm) — dùng chung với DragGhostController. */
    private ghostMaterialSet: GhostMaterialSet | null = null;
    /** Preview CSG tường cho item loại "opening" (Door/Window). */
    private readonly wallOpeningPreview: WallOpeningPreview;
    /** wallId của tường đang được preview — dùng để detect khi ghost chuyển sang tường khác. */
    private activePreviewWallId: string | null = null;
    /** Hash của existing openings lúc begin() lần cuối — force re-begin khi openings thay đổi. */
    private activePreviewOpeningsHash = "";

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
    ) {
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
        this.wallOpeningPreview = new WallOpeningPreview(scene);

        const guideGeom = new THREE.BufferGeometry();
        guideGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        this.guideLine = new THREE.Line(
            guideGeom,
            new THREE.LineBasicMaterial({ color: 0xf8b400, depthTest: false, transparent: true }),
        );
        this.guideLine.renderOrder = 999;
        this.guideLine.visible = false;
        this.guideLine.frustumCulled = false;
        this.scene.add(this.guideLine);
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
        this.wallPickMeshes = [];
        if (this.placement.constraint === "wall") {
            for (const e of Query.entitiesWith(this.world, WallNodes, Mesh)) {
                const meshComp = this.world.getComponent(e, Mesh);
                if (!meshComp) continue;
                (meshComp.mesh as WallPickMesh).__wallEntity = e;
                this.wallPickMeshes.push(meshComp.mesh);
            }
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
        // Dispose preview tường (restore wall thật) trước khi gỡ ghost.
        this.wallOpeningPreview.dispose();
        this.activePreviewWallId = null;
        this.activePreviewOpeningsHash = "";

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
        this.wallPickMeshes = [];
        this.wallHit = null;
        this.ghostBaseOffsetY = 0;
    }

    private applyGhostTint(colliding: boolean): void {
        this.ghostMaterialSet?.setColliding(colliding);
    }

    private onMouseMove = (e: MouseEvent): void => {
        const ghost = this.ghostRoot;
        if (!ghost) return;
        const rect = this.domElement.getBoundingClientRect();
        this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.ndc, this.camera);
        if (!this.template || !this.modelId) return; // ghost chỉ tồn tại khi template đã nạp

        // Item bám tường: raycast mặt tường thay vì mặt sàn (nhánh riêng).
        if (this.placement?.constraint === "wall") {
            this.updateWallGhost();
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
        if (colliding !== this.isColliding) {
            this.isColliding = colliding;
            this.applyGhostTint(colliding);
        }
    };

    /**
     * Ghost cho item bám tường: raycast mặt tường, chiếu lên tim tường để lấy (t, side),
     * đặt ghost áp/nhúng tường. Đặt this.wallHit (null = không hợp lệ → chặn đặt).
     * Với item loại "opening": hiển thị preview CSG tường bị khoét.
     */
    private updateWallGhost(): void {
        const ghost = this.ghostRoot;
        if (!ghost || !this.template || !this.modelId || !this.placement) return;

        const hits = this.raycaster.intersectObjects(this.wallPickMeshes, false);
        if (hits.length === 0) {
            ghost.visible = false;
            this.wallHit = null;
            this.setWallInvalid();
            this.wallOpeningPreview.hide();
            this.activePreviewWallId = null;
            return;
        }

        const hit = hits[0];
        const wallEntity = (hit.object as WallPickMesh).__wallEntity;
        if (wallEntity == null) {
            ghost.visible = false;
            this.wallHit = null;
            this.setWallInvalid();
            this.wallOpeningPreview.hide();
            this.activePreviewWallId = null;
            return;
        }

        const tag = this.world.getComponent(wallEntity, WallTag);
        const wn = this.world.getComponent(wallEntity, WallNodes);
        const sizeC = this.world.getComponent(wallEntity, WallSize);
        if (!tag || !wn) {
            ghost.visible = false;
            this.wallHit = null;
            this.setWallInvalid();
            this.wallOpeningPreview.hide();
            this.activePreviewWallId = null;
            return;
        }
        const a = this.nodeRegistry.get(wn.startNodeId);
        const b = this.nodeRegistry.get(wn.endNodeId);
        if (!a || !b) {
            ghost.visible = false;
            this.wallHit = null;
            this.setWallInvalid();
            this.wallOpeningPreview.hide();
            this.activePreviewWallId = null;
            return;
        }

        const wall: MountWall = { wallId: tag.wallId, ax: a.x, az: a.z, bx: b.x, bz: b.z, thickness: wn.thickness };
        const halfWidth = getFootprint2D(this.modelId).width / 2;
        const { t, side, fits } = projectPointToWall(wall, hit.point.x, hit.point.z, halfWidth);

        // Pose qua nguồn chân lý chung (depth từ footprint catalog), khớp đúng lúc spawn.
        const sy = this.template.size.y;
        const dims = resolveWallItemDims(this.modelId, sy);
        const pose = wallItemPose(wall, t, side, dims);

        ghost.position.set(pose.x, this.ghostBaseOffsetY + pose.baseY, pose.z);
        const half = pose.rotY / 2;
        ghost.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
        ghost.visible = true;
        this.guideLine.visible = false;

        // Hợp lệ: tường đủ dài (fits) + lỗ/kệ nằm gọn trong chiều cao tường + không overlap.
        const wallHeight = sizeC?.height ?? Infinity;
        const topExtent = dims.behavior === "opening" ? (this.placement.cut?.height ?? sy) : sy;
        const topY = pose.baseY + topExtent;
        const heightOk = pose.baseY >= -1e-3 && topY <= wallHeight + 1e-3;

        // Chống chồng lấn: kiểm tra t-range ghost có overlap với items đã đặt.
        const wallLen = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) || 1e-6;
        const halfWidthT = halfWidth / wallLen;
        const occupied = collectOccupiedRanges(this.world, wall.wallId, wallLen, "");
        const lane = occupancyLane(dims.behavior, side);
        const overlapFree = !wallItemOverlaps(t, halfWidthT, lane, occupied);

        const valid = fits && heightOk && overlapFree;

        this.wallHit = valid ? { hostWallId: wall.wallId, t, side } : null;
        const colliding = !valid;
        if (colliding !== this.isColliding) {
            this.isColliding = colliding;
            this.applyGhostTint(colliding);
        }

        // CSG Preview: chỉ cho item loại "opening" (Door/Window).
        if (dims.behavior === "opening") {
            this._updateOpeningPreview(wallEntity, wall, sizeC, t, dims);
        }
    }

    /**
     * Cập nhật preview CSG tường cho item loại "opening".
     * Tách thành method riêng để giữ updateWallGhost() gọn.
     */
    private _updateOpeningPreview(
        wallEntity: string,
        wall: MountWall,
        sizeC: WallSize | undefined,
        t: number,
        dims: ReturnType<typeof resolveWallItemDims>,
    ): void {
        const meshComp = this.world.getComponent(wallEntity, Mesh);
        const poly = this.world.getComponent(wallEntity, WallPolygon);
        const size = sizeC ?? this.world.getComponent(wallEntity, WallSize);
        if (!meshComp || !poly || !size) { this.wallOpeningPreview.hide(); return; }

        // Gom các lỗ đã commit trên tường này (không tính ghost hiện tại).
        const existingOpenings = Query.entitiesWith(this.world, WallOpening)
            .map((e) => this.world.getComponent(e, WallOpening)!)
            .filter((wo) => wo.hostWallId === wall.wallId)
            .map((wo) => ({ t: wo.t, width: wo.width, height: wo.height, sill: wo.sill }));

        // Tính hash để detect thay đổi openings mà không rebuild mỗi frame.
        const openingsHash = existingOpenings.map(o => o.t.toFixed(4)).join(",");

        // Nếu ghost chuyển sang tường khác hoặc openings thay đổi → begin() lại (pre-compute baseGeo mới).
        if (this.activePreviewWallId !== wall.wallId || this.activePreviewOpeningsHash !== openingsHash) {
            this.wallOpeningPreview.begin(
                meshComp.mesh,
                poly.points,
                size.height,
                wall,
                existingOpenings,
            );
            this.activePreviewWallId = wall.wallId;
            this.activePreviewOpeningsHash = openingsHash;
        }

        // Tính thông số lỗ ghost từ catalog (width = footprint, height/sill từ dims).
        const ghostOpening = {
            t,
            width: getFootprint2D(this.modelId!).width,
            height: dims.height > 0 ? dims.height : (this.template?.size.y ?? 2.1),
            sill: dims.sill,
        };
        this.wallOpeningPreview.update(ghostOpening);
    }

    /** Đánh dấu ghost bám tường ở trạng thái không hợp lệ (tô đỏ). */
    private setWallInvalid(): void {
        if (!this.isColliding) {
            this.isColliding = true;
            this.applyGhostTint(true);
        }
    }

    /** Vẽ đường gióng wall-snap (sát sàn); ẩn nếu không có. */
    private updateGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        if (guides.length === 0) {
            this.guideLine.visible = false;
            return;
        }
        const g = guides[0];
        const pos = this.guideLine.geometry.getAttribute("position") as THREE.BufferAttribute;
        pos.setXYZ(0, g.x1, 0.02, g.z1);
        pos.setXYZ(1, g.x2, 0.02, g.z2);
        pos.needsUpdate = true;
        this.guideLine.visible = true;
    }

    private onMouseDown = (e: MouseEvent): void => {
        if (!this.active) return;
        e.stopPropagation();
        if (e.button === 0) {
            // Item bám tường: chỉ đặt khi có wallHit hợp lệ.
            if (this.placement?.constraint === "wall") {
                if (!this.wallHit) return;
                this.confirmWallItem(this.wallHit.hostWallId, this.wallHit.t, this.wallHit.side);
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
        this.scene.remove(this.guideLine);
        this.guideLine.geometry.dispose();
        (this.guideLine.material as THREE.Material).dispose();
    }
}
