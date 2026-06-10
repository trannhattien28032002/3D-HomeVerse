/**
 * GizmoSystem — chọn và biến đổi (di chuyển/xoay) nội thất trong khung nhìn 3D.
 *
 * Dùng TransformControls của Three.js. Luồng chính:
 *   - mousedown → raycast chọn entity → attach gizmo.
 *   - Khi kéo (dragging-changed): tắt orbit, mở transaction undo, tạm chuyển
 *     entity từ StaticBody → DynamicBody để va chạm sweep hoạt động, bật drag-ghost.
 *   - Khi đổi vị trí (objectChange): test va chạm; nếu trống thì "teleport" theo
 *     con trỏ, nếu đụng thì clamp tại vật cản còn ghost lơ lửng ở con trỏ.
 *   - Thả ra: đóng transaction, sau vài frame trả entity về StaticBody.
 *
 * Lưu ý hệ toạ độ Y: GLB lấy pivot ở đáy mesh (y=0), còn Transform/va chạm dùng
 * tâm AABB → cần cộng/trừ half-height (xem các đoạn adjustedY bên dưới).
 */
import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";

import { Transform } from "src/engine/components/core/Transform";
import { DynamicBody } from "src/engine/components/physics/DynamicBody";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";

import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import { SNAP_M, ROT_STEP_RAD } from "src/shared/constants/placement";
import { type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import {
    type MeshWithEntity,
    collectPickTargets,
    resolveHitEntity,
    applyRotateCheck,
    isWallItem,
    slideWallItem,
    flipWallItemByGizmo,
    handleFurnitureTranslate,
} from "src/engine/systems/gizmo/gizmoHandles";
import { GizmoHeld } from "src/engine/components/interaction/GizmoHeld";
import { Model3D } from "src/engine/components/render/Model3D";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { wallNaturalRotY } from "src/shared/geometry/wallMount";
import { WallOpeningPreview } from "src/engine/systems/wall/WallOpeningPreview";
import type { OpeningCut } from "src/engine/systems/wall/wallOpeningCutter";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Mesh } from "src/engine/components/render/Mesh";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { Query } from "src/engine/ecs/Query";
import { findMountWall } from "src/engine/adapters/wallRefs";

/**
 * True khi focus đang ở một ô nhập liệu (input/textarea/contentEditable).
 * Định nghĩa cục bộ ở tầng engine để không phụ thuộc vào tầng app
 * (các hook React 2D có bản sao riêng — chủ ý giữ engine độc lập).
 */
function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export class GizmoSystem extends System {
    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private controls: TransformControls;
    private rendererDomElement: HTMLCanvasElement;
    /** OrbitControls của scene — tắt khi đang kéo gizmo để không xoay camera. */
    private orbitControls: OrbitControls;

    private world!: World;
    private draggingEntity: string | null = null;
    private draggingEntityWasStatic: boolean = false;
    private releaseFramesLeft: number = 0;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private pickObjects: THREE.Object3D[] = [];
    private events?: EngineEvents;
    private collisionSystem: CannonCollisionSystem;
    private dragGhostController: DragGhostController;
    private nodeRegistry: NodeRegistry;
    private currentMode: "translate" | "rotate" = "translate";

    /** Đường gióng wall-snap (world-space) hiển thị khi mép vật áp tường. */
    private guideLine: THREE.Line;
    /** Segments tường gom 1 lần khi bắt đầu kéo (tường tĩnh trong lúc kéo). */
    private dragWallSegments: WallSegment[] = [];
    /** Footprint đồ lân cận gom 1 lần khi bắt đầu kéo (cho neighbor-align). */
    private dragFurnitureBoxes: FurnitureBox[] = [];

    private onBeginTransaction: ((label: string) => void) | null = null;
    private onCommitTransaction: (() => void) | null = null;
    private onDeleteEntity: ((entityId: string) => void) | null = null;

    /** Preview CSG tường cho door/window khi kéo gizmo. */
    private readonly wallOpeningPreview: WallOpeningPreview;
    /** wallId đang được preview — để detect khi thay đổi tường. */
    private activePreviewWallId: string | null = null;
    /** Hash của existing openings lúc begin() lần cuối — để detect thay đổi cần rebuild. */
    private activePreviewOpeningsHash = "";

    setCommandCallbacks(
        beginTransaction: (label: string) => void,
        commitTransaction: () => void,
        deleteEntity: (entityId: string) => void,
    ): void {
        this.onBeginTransaction = beginTransaction;
        this.onCommitTransaction = commitTransaction;
        this.onDeleteEntity = deleteEntity;
    }

    constructor(
        camera: THREE.Camera,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        orbitControls: OrbitControls,
        nodeRegistry: NodeRegistry,
        events?: EngineEvents,
        collisionSystem?: CannonCollisionSystem,
        dragGhostController?: DragGhostController,
    ) {
        super();

        this.camera = camera;
        this.scene = scene;
        this.rendererDomElement = renderer.domElement;
        this.orbitControls = orbitControls;
        this.nodeRegistry = nodeRegistry;
        this.wallOpeningPreview = new WallOpeningPreview(scene);

        this.controls = new TransformControls(camera, renderer.domElement);
        this.controls.setMode("translate");
        // Snap góc do gizmo tự bắt (15°). Snap VỊ TRÍ KHÔNG dùng translationSnap nữa
        // vì resolveAlignment (edge-snap + wall-snap) là nguồn có thẩm quyền — dùng
        // translationSnap (center-based) sẽ lệch với edge-snap. SNAP_M giữ để tham chiếu.
        void SNAP_M;
        this.controls.setRotationSnap(ROT_STEP_RAD);

        this.scene.add(this.controls.getHelper());
        this.events = events;
        this.collisionSystem = collisionSystem!;
        this.dragGhostController = dragGhostController!;

        // Đường gióng wall-snap: line đơn giản nằm sát sàn, ẩn cho tới khi snap tường.
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

        this.controls.addEventListener("dragging-changed", this.onDraggingChanged);
        this.controls.addEventListener("objectChange", this.onObjectChange);

        this.rendererDomElement.addEventListener("mousedown", this.onMouseDown);
        window.addEventListener("keydown", this.onKeyDown);
    }

    /**
     * TransformControls bắt đầu / kết thúc kéo.
     *  - Bắt đầu: tắt orbit, mở transaction, chuyển StaticBody→DynamicBody (trừ wall-item),
     *    bật drag-ghost + gom segments tường/đồ lân cận cho snap.
     *  - Kết thúc: dọn ghost/guide, đóng transaction, hẹn trả lại StaticBody sau vài frame.
     */
    private onDraggingChanged = (event: { value?: unknown }) => {
        const isDragging = Boolean(event.value);
        this.orbitControls.enabled = !isDragging;

        const object = this.controls.object;
        const entity = object ? (object as MeshWithEntity).__entity ?? null : null;

        if (isDragging) {
            if (entity == null) return;

            const label = this.currentMode === "rotate"
                ? "rotate furniture 3D"
                : "move furniture 3D";
            this.onBeginTransaction?.(label);

            this.draggingEntity = entity;

            // Wall-item (cửa/kệ): không có collider (Physics AABB) → không swap body,
            // và không cần gom wall segments cho alignment (vì bám thẳng trên tường).
            if (isWallItem(this.world, entity)) {
                this.draggingEntityWasStatic = false;
                this.releaseFramesLeft = 0;
                // Đánh dấu để WallMountSystem không ghi đè quaternion trong lúc kéo.
                this.world.addComponent(entity, new GizmoHeld());
                if (this.currentMode === "translate") {
                    this.dragGhostController?.begin(this.world, entity);
                }
                this.events?.emit("draggingChanged", { entityId: entity, dragging: true });
                return;
            }

            this.draggingEntityWasStatic = this.world.hasComponent(entity, StaticBody);
            this.releaseFramesLeft = 0;

            if (this.draggingEntityWasStatic) {
                this.world.removeComponent(entity, StaticBody);
            }
            if (!this.world.hasComponent(entity, DynamicBody)) {
                this.world.addComponent(entity, new DynamicBody());
            }

            // Chế độ xoay không dùng ghost — vật xoay tại chỗ.
            if (this.currentMode === "translate") {
                this.dragGhostController?.begin(this.world, entity);
                // Gom tường + đồ lân cận 1 lần (tĩnh trong lúc kéo) cho snap.
                this.dragWallSegments = collectWallSegments(this.world, this.nodeRegistry);
                this.dragFurnitureBoxes = collectFurnitureBoxes(this.world, entity);
            }
            this.events?.emit("draggingChanged", { entityId: entity, dragging: true });
            return;
        }

        if (this.draggingEntity == null) return;

        // Wall-item: không tạo ghost/body → commit + emit + dọn marker, không cần release frames.
        if (isWallItem(this.world, this.draggingEntity)) {
            const e = this.draggingEntity;
            // Xoá marker để WallMountSystem tiếp tục cập nhật entity.
            if (this.world.hasComponent(e, GizmoHeld)) {
                this.world.removeComponent(e, GizmoHeld);
            }
            // Sau rotate: snap quaternion về wall-derived rotY theo side đã flip.
            if (this.currentMode === "rotate") {
                this._snapWallItemRotation(e);
            }
            // Sau translate: dọn ghost (ghost được tạo ở drag-start cho translate).
            if (this.currentMode === "translate") {
                this.dragGhostController?.end();
            }
            this.wallOpeningPreview.dispose();
            this.activePreviewWallId = null;
            this.activePreviewOpeningsHash = "";
            this.onCommitTransaction?.();
            this.events?.emit("draggingChanged", { entityId: e, dragging: false });
            this.draggingEntity = null;
            return;
        }
        // Ghost không hề khởi tạo ở chế độ xoay — chỉ dọn dẹp ở chế độ translate.
        if (this.currentMode === "translate") {
            this.dragGhostController?.end();
        }
        this.hideGuide();
        this.dragWallSegments = [];
        this.dragFurnitureBoxes = [];
        this.onCommitTransaction?.();
        this.releaseFramesLeft = 2;
        this.events?.emit("draggingChanged", { entityId: this.draggingEntity, dragging: false });
    };

    /**
     * TransformControls di chuyển object đang gắn. Rẽ 2 đường:
     *  - Wall-item: cập nhật topology (t/side) + ghim mesh vào tường + CSG preview.
     *  - Furniture thường: rotate-check, hoặc translate (snap + collision + ghost qua helper).
     */
    private onObjectChange = () => {
        const object = this.controls.object;
        if (!object) return;

        const entity = (object as MeshWithEntity).__entity;
        if (entity == null) return;

        const transform = this.world.getComponent(entity, Transform);
        if (!transform) return;

        // Wall-item (cửa/kệ): cập nhật topology (t/side) + ghim mesh vào tường, KHÔNG đi
        // đường furniture (alignment/collision/ghost). WallMountSystem xác nhận Transform và
        // WallOpeningSystem re-cut lỗ ở frame kế (hash t đổi). Hướng do tường quyết định → rotate no-op.
        if (isWallItem(this.world, entity)) {
            if (this.currentMode === "rotate") {
                flipWallItemByGizmo(this.world, this.nodeRegistry, entity, object);
                return;
            }
            const result = slideWallItem(this.world, this.nodeRegistry, entity, object.position.x, object.position.z);
            if (result.success) {
                this.world.markDirty();
                if (result.isOverlapping && result.intendedPose) {
                    this.dragGhostController?.update(result.intendedPose, true);
                } else {
                    this.dragGhostController?.hide();
                }
                // CSG preview cho door/window khi kéo gizmo.
                const wo = this.world.getComponent(entity, WallOpening);
                if (wo) {
                    this._updateGizmoOpeningPreview(wo.hostWallId, wo.t, wo.width, wo.height, wo.sill, entity);
                }
            }
            return;
        }

        // ColliderAABB.width/depth/height là half-extent (xem FurnitureFactory +
        // CannonCollisionSystem.prepareProbe).
        const collider = this.world.getComponent(entity, ColliderAABB) ?? null;

        // Chế độ xoay: kiểm tra footprint OBB đã xoay; chặn nếu chồng lên thứ gì đó.
        if (this.currentMode === "rotate") {
            applyRotateCheck(this.controls, transform, collider, this.collisionSystem, entity, this.world);
            return;
        }

        // Furniture-thường (translate): snap + collision teleport/clamp + ghost (tách sang helper).
        handleFurnitureTranslate({
            world: this.world,
            entity,
            object,
            transform,
            collider,
            collisionSystem: this.collisionSystem,
            dragGhost: this.dragGhostController,
            wallSegments: this.dragWallSegments,
            neighbors: this.dragFurnitureBoxes,
            updateGuide: (guides) => this.updateGuide(guides),
        });
    };

    private onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (isTypingTarget(event.target)) return;
        const object = this.controls.object;
        if (!object) return;
        const entity = (object as MeshWithEntity).__entity ?? null;
        if (entity == null) return;
        this.onDeleteEntity?.(entity);
        this.controls.detach();
        this.events?.emit("entitySelected", { entityId: null });
    };

    private onMouseDown = (event: MouseEvent) => {
        const rect = (event.target as HTMLElement).getBoundingClientRect();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        collectPickTargets(this.world, this.pickObjects);
        // recursive=true để Three.js bắt được cả mesh con bên trong Group GLB
        const hits = this.raycaster.intersectObjects(this.pickObjects, true);

        if (this.controls.dragging) return;

        if (hits.length === 0) {
            this.controls.detach();
            this.events?.emit("entitySelected", { entityId: null });
            return;
        }

        const resolved = resolveHitEntity(hits[0].object as MeshWithEntity, this.world);
        if (resolved) {
            this.controls.attach(resolved.attachTarget);
            this._applyGizmoAxes(resolved.entityId);
            this.events?.emit("entitySelected", { entityId: resolved.entityId });
        } else {
            this.controls.detach();
            this.events?.emit("entitySelected", { entityId: null });
        }
    };

    /** Vẽ đường gióng wall-snap (sát sàn) từ guide đầu tiên; ẩn nếu không có. */
    private updateGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        if (guides.length === 0) {
            this.hideGuide();
            return;
        }
        const g = guides[0];
        const y = 0.02; // nhô nhẹ trên sàn để không bị z-fight
        const pos = this.guideLine.geometry.getAttribute("position") as THREE.BufferAttribute;
        pos.setXYZ(0, g.x1, y, g.z1);
        pos.setXYZ(1, g.x2, y, g.z2);
        pos.needsUpdate = true;
        this.guideLine.visible = true;
    }

    private hideGuide(): void {
        this.guideLine.visible = false;
    }

    /**
     * Snap quaternion của wall-item về wall-derived rotY theo side hiện tại.
     * Gọi khi kết thúc drag rotate để xác nhận chiều quay cuối cùng.
     */
    private _snapWallItemRotation(entity: string): void {
        const wo = this.world.getComponent(entity, WallOpening);
        const wm = this.world.getComponent(entity, WallMounted);
        const hostWallId = wo ? wo.hostWallId : wm?.hostWallId;
        if (!hostWallId) return;
        const wall = findMountWall(this.world, this.nodeRegistry, hostWallId);
        if (!wall) return;
        const side = wo ? wo.side : (wm?.side ?? 1);
        const wallRotY0 = wallNaturalRotY(wall);
        const rotY = side === 1 ? wallRotY0 : wallRotY0 + Math.PI;
        const model = this.world.getComponent(entity, Model3D);
        if (!model) return;
        const half = rotY / 2;
        model.root.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
        this.world.markDirty();
    }

    setGizmoMode(mode: "translate" | "rotate"): void {
        if (this.controls.dragging) return;
        this.currentMode = mode;
        this.controls.setMode(mode);
        // Trục gizmo phụ thuộc cả mode → áp lại cho entity đang gắn (nếu có).
        const entity = (this.controls.object as MeshWithEntity | undefined)?.__entity;
        if (entity != null) this._applyGizmoAxes(entity);
        this.events?.emit("gizmoModeChanged", { mode });
    }

    /**
     * Bật/tắt trục gizmo theo loại entity + mode hiện tại:
     *   - Furniture thường: đủ X/Y/Z.
     *   - Wall-item + rotate: CHỈ trục Y (lật đối xứng cửa / đổi mặt kệ) — cấm nghiêng X/Z.
     *   - Wall-item + translate: trượt dọc tường (X/Z, sẽ chiếu về tim tường); kệ (mount)
     *     thêm Y để kéo lên/xuống đổi cao độ, cửa/cửa sổ khoá Y (cao độ theo sill).
     */
    private _applyGizmoAxes(entity: string): void {
        if (!isWallItem(this.world, entity)) {
            this.controls.showX = true;
            this.controls.showY = true;
            this.controls.showZ = true;
            return;
        }
        if (this.currentMode === "rotate") {
            this.controls.showX = false;
            this.controls.showY = true;
            this.controls.showZ = false;
            return;
        }
        const isOpening = this.world.hasComponent(entity, WallOpening);
        this.controls.showX = true;
        this.controls.showZ = true;
        this.controls.showY = !isOpening; // kệ cho kéo lên/xuống; cửa giữ cao độ
    }

    dispose() {
        this.wallOpeningPreview.dispose();
        this.activePreviewWallId = null;
        this.activePreviewOpeningsHash = "";
        this.dragGhostController?.end();
        this.rendererDomElement.removeEventListener("mousedown", this.onMouseDown);
        window.removeEventListener("keydown", this.onKeyDown);
        this.controls.detach();
        this.scene.remove(this.controls.getHelper());
        this.controls.dispose();
        this.scene.remove(this.guideLine);
        this.guideLine.geometry.dispose();
        (this.guideLine.material as THREE.Material).dispose();
    }

    /**
     * Cập nhật preview CSG tường khi kéo gizmo door/window.
     * Khi wallId thay đổi hoặc existing openings hash thay đổi → begin() lại.
     */
    private _updateGizmoOpeningPreview(
        hostWallId: string,
        t: number,
        cutWidth: number,
        cutHeight: number,
        sill: number,
        excludeEntity: string,
    ): void {
        let wallEntity: string | undefined;
        for (const e of Query.entitiesWith(this.world, WallTag, WallNodes)) {
            const tag = this.world.getComponent(e, WallTag);
            if (tag?.wallId === hostWallId) { wallEntity = e; break; }
        }
        if (!wallEntity) return;

        const meshComp = this.world.getComponent(wallEntity, Mesh);
        const poly = this.world.getComponent(wallEntity, WallPolygon);
        const size = this.world.getComponent(wallEntity, WallSize);
        if (!meshComp || !poly || !size) return;

        const wall = findMountWall(this.world, this.nodeRegistry, hostWallId);
        if (!wall) return;

        // Chỉ gom LỖ THẬT (WallOpening) trên tường, trừ entity đang kéo — KHÔNG dùng
        // occupancy (gồm cả kệ WallMounted). Kệ không khoét tường; nếu trừ kệ vào baseGeo
        // sẽ thấy tường THỦNG ngay tại vị trí kệ trong lúc kéo cửa. Mỗi lỗ giữ đúng
        // width/height/sill của chính nó (không ép theo cửa đang kéo).
        const existingOpenings: OpeningCut[] = [];
        for (const e of Query.entitiesWith(this.world, WallOpening)) {
            if (e === excludeEntity) continue;
            const wo = this.world.getComponent(e, WallOpening)!;
            if (wo.hostWallId !== hostWallId) continue;
            existingOpenings.push({ t: wo.t, width: wo.width, height: wo.height, sill: wo.sill });
        }
        const openingsHash = existingOpenings
            .map(o => `${o.t.toFixed(4)},${o.width.toFixed(3)},${o.height.toFixed(3)},${o.sill.toFixed(3)}`)
            .sort()
            .join("|");

        if (this.activePreviewWallId !== hostWallId || this.activePreviewOpeningsHash !== openingsHash) {
            this.wallOpeningPreview.begin(meshComp.mesh, poly.points, size.height, wall, existingOpenings);
            this.activePreviewWallId = hostWallId;
            this.activePreviewOpeningsHash = openingsHash;
        }

        this.wallOpeningPreview.update({ t, width: cutWidth, height: cutHeight, sill });
    }

    update(world: World): void {
        this.world = world;

        // Guard: entity bị xoá giữa lúc kéo (ví dụ undo) — dọn ghost + marker.
        if (this.draggingEntity != null && !world.hasComponent(this.draggingEntity, Transform)) {
            this.dragGhostController?.end();
            // GizmoHeld đã gắn nhưng entity biến mất → không thể removeComponent; chỉ clear state.
            this.draggingEntity = null;
            this.draggingEntityWasStatic = false;
            this.releaseFramesLeft = 0;
        }

        if (this.releaseFramesLeft > 0) {
            this.releaseFramesLeft--;
            if (this.releaseFramesLeft === 0 && this.draggingEntity != null) {
                const e = this.draggingEntity;

                if (this.world.hasComponent(e, DynamicBody)) {
                    this.world.removeComponent(e, DynamicBody);
                }
                if (
                    this.draggingEntityWasStatic &&
                    !this.world.hasComponent(e, StaticBody)
                ) {
                    this.world.addComponent(e, new StaticBody());
                }

                this.draggingEntity = null;
                this.draggingEntityWasStatic = false;
            }
        }
    }
}
