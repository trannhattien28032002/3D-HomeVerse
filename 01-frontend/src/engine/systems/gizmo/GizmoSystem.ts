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
import { createGuideLine, setGuideLine, disposeGuideLine } from "src/engine/rendering/guideLine";

import { Transform } from "src/engine/components/core/Transform";
import { DynamicBody } from "src/engine/components/physics/DynamicBody";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";

import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CachedClientRect } from "src/shared/dom/cachedRect";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import { PointerRotateTracker } from "src/engine/systems/gizmo/pointerRotate";
import { ROT_STEP_RAD } from "src/shared/constants/placement";
import { quatToYaw, setYawQuaternion } from "src/shared/math/yaw";
import { isTypingTarget } from "src/shared/dom/isTypingTarget";
import { type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import {
    readEntity,
    resolvePick,
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
import {
    WallOpeningPreviewController,
    collectExistingOpenings,
} from "src/engine/systems/wall/WallOpeningPreviewController";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Mesh } from "src/engine/components/render/Mesh";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { Query } from "src/engine/ecs/Query";
import { findMountWall } from "src/engine/adapters/wallRefs";
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";
import type { RenderScheduler } from "src/engine/rendering/RenderScheduler";
import { perfEnabled, perfMark } from "src/engine/rendering/perfProbe";


/**
 * Số frame trễ giữa lúc thả gizmo và lúc gỡ DynamicBody / phục hồi static.
 * Để vật lý settle 1–2 frame sau drag trước khi đổi loại body (tránh giật).
 */
const RELEASE_FRAMES = 2;

export class GizmoSystem extends System {
    private camera: THREE.Camera;
    private scene: THREE.Scene;
    /** Scene phủ chứa gizmo — render sau composer để OutlinePass không tô viền lên gizmo. */
    private overlayScene: THREE.Scene;
    private controls: TransformControls;
    private rendererDomElement: HTMLCanvasElement;
    /** LW-03: rect canvas cache — PointerRotateTracker đọc mỗi frame khi rotate. */
    private rectCache: CachedClientRect;
    /** OrbitControls của scene — tắt khi đang kéo gizmo để không xoay camera. */
    private orbitControls: OrbitControls;

    private world!: World;
    private draggingEntity: string | null = null;
    private draggingEntityWasStatic: boolean = false;
    private releaseFramesLeft: number = 0;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private pickObjects: THREE.Object3D[] = [];
    /** Mesh tường để raycast chọn đổi material (tách khỏi furniture — không attach gizmo). */
    private wallPickObjects: THREE.Object3D[] = [];
    /** Mesh sàn phòng để raycast chọn đổi material sàn (ưu tiên thấp nhất). */
    private roomPickObjects: THREE.Object3D[] = [];
    /** Registry mesh — tra mesh sàn `room-${entity}` (sàn không có component Mesh). */
    private meshRegistry: MeshRegistry;
    private events?: EngineEvents;
    private collisionSystem: CannonCollisionSystem;
    private dragGhostController: DragGhostController;
    private nodeRegistry: NodeRegistry;
    /** On-demand render (CR-03): báo cần vẽ lại khi gizmo đổi (hover/attach/detach/drag). */
    private scheduler?: RenderScheduler;
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

    // --- Rotate "vô-lăng": tự tính yaw từ góc con trỏ quanh tâm vật ---------
    // (xem applyRotateCheck) — tránh đảo chiều khi kéo gần trọn vòng.
    /** Toán rotate vô-lăng (tracking con trỏ + cộng dồn góc) — xem pointerRotate.ts. */
    private readonly pointerRotate: PointerRotateTracker;

    /** Preview CSG tường cho door/window khi kéo gizmo (begin-vs-update qua controller). */
    private readonly openingPreview: WallOpeningPreviewController;

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
        meshRegistry: MeshRegistry,
        overlayScene: THREE.Scene,
        events?: EngineEvents,
        collisionSystem?: CannonCollisionSystem,
        dragGhostController?: DragGhostController,
        scheduler?: RenderScheduler,
    ) {
        super();
        this.scheduler = scheduler;

        this.camera = camera;
        this.scene = scene;
        this.overlayScene = overlayScene;
        this.rendererDomElement = renderer.domElement;
        this.rectCache = new CachedClientRect(this.rendererDomElement);
        this.pointerRotate = new PointerRotateTracker(camera, this.rectCache);
        this.orbitControls = orbitControls;
        this.nodeRegistry = nodeRegistry;
        this.meshRegistry = meshRegistry;
        this.openingPreview = new WallOpeningPreviewController(scene);

        this.controls = new TransformControls(camera, renderer.domElement);
        this.controls.setMode("translate");
        // Snap góc do gizmo tự bắt (15°). Snap VỊ TRÍ KHÔNG dùng translationSnap nữa
        // vì resolveAlignment (edge-snap + wall-snap) là nguồn có thẩm quyền — dùng
        // translationSnap (center-based) sẽ lệch với edge-snap.
        this.controls.setRotationSnap(ROT_STEP_RAD);

        // Gizmo vào overlayScene (render sau composer) — KHÔNG vào scene chính, nếu không
        // OutlinePass sẽ tô viền lên gizmo (TransformControls tự bật lại visible handle).
        this.overlayScene.add(this.controls.getHelper());
        this.events = events;
        this.collisionSystem = collisionSystem!;
        this.dragGhostController = dragGhostController!;

        // Đường gióng wall-snap dùng chung (xem rendering/guideLine). (L5)
        this.guideLine = createGuideLine(this.scene);

        this.controls.addEventListener("dragging-changed", this.onDraggingChanged);
        this.controls.addEventListener("objectChange", this.onObjectChange);
        // On-demand render: gizmo phát "change" khi hover đổi trục, lúc kéo, và mỗi
        // updateMatrixWorld → cần vẽ lại frame đó (các thay đổi này không bump revision).
        this.controls.addEventListener("change", this.requestRender);

        this.rendererDomElement.addEventListener("mousedown", this.onMouseDown);
        // Chuột phải = bỏ chọn mọi thứ (và chặn menu ngữ cảnh mặc định của trình duyệt).
        this.rendererDomElement.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("keydown", this.onKeyDown);
        // Capture-phase để con trỏ luôn được cập nhật TRƯỚC khi TransformControls
        // xử lý pointermove → đọc đúng vị trí con trỏ trong objectChange.
        window.addEventListener("pointerdown", this.onPointerTrack, true);
        window.addEventListener("pointermove", this.onPointerTrack, true);
    }

    /** Báo RenderScheduler cần vẽ lại 1 frame (on-demand render — CR-03). */
    private requestRender = () => {
        this.scheduler?.requestRender();
    };

    /** Lưu vị trí con trỏ mới nhất cho rotate "vô-lăng". */
    private onPointerTrack = (event: PointerEvent) => {
        this.pointerRotate.trackPointer(event.clientX, event.clientY);
    };

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
        const entity = readEntity(object);

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
            } else {
                // Rotate "vô-lăng": chốt yaw gốc + góc con trỏ gốc làm mốc cộng dồn.
                const tr = this.world.getComponent(entity, Transform);
                const startYaw = tr ? quatToYaw(tr.qx, tr.qy, tr.qz, tr.qw) : 0;
                this.pointerRotate.begin(object, startYaw);
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
                this.snapWallItemRotation(e);
            }
            // Sau translate: dọn ghost (ghost được tạo ở drag-start cho translate).
            if (this.currentMode === "translate") {
                this.dragGhostController?.end();
            }
            this.openingPreview.clear();
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
        this.releaseFramesLeft = RELEASE_FRAMES;
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

        const entity = readEntity(object);
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
                    this.updateOpeningPreview(wo.hostWallId, wo.t, wo.width, wo.height, wo.sill, entity);
                }
            }
            return;
        }

        // ColliderAABB.width/depth/height là half-extent (xem FurnitureFactory +
        // CannonCollisionSystem.prepareProbe).
        const collider = this.world.getComponent(entity, ColliderAABB) ?? null;

        // Chế độ xoay: yaw tính từ GÓC CON TRỎ (không dùng quaternion của gizmo —
        // tránh đảo chiều khi kéo gần trọn vòng). Kiểm tra footprint OBB đã xoay;
        // chặn nếu chồng lên thứ gì đó.
        if (this.currentMode === "rotate") {
            const rawYaw = this.pointerRotate.computeYaw(object);
            applyRotateCheck(this.controls, transform, collider, this.collisionSystem, entity, this.world, rawYaw);
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
        const entity = readEntity(object);
        if (entity == null) return;
        this.onDeleteEntity?.(entity);
        this.controls.detach();
        this.events?.emit("entitySelected", { entityId: null });
        this.requestRender();
    };

    private onMouseDown = (event: MouseEvent) => {
        // Chỉ chuột TRÁI mới chọn/thao tác. Chuột phải/giữa bỏ qua — bỏ chọn do
        // onContextMenu xử lý (tránh attach gizmo chớp nháy rồi lại detach).
        if (event.button !== 0) return;

        // attach/detach của TransformControls KHÔNG phát "change" → tự báo vẽ lại
        // để gizmo + viền chọn cập nhật ngay sau click.
        this.requestRender();

        // LW-03: listener gắn trên rendererDomElement nên event.target chính là canvas
        // (không có child) → dùng rect cache thay vì getBoundingClientRect() mỗi click.
        const rect = this.rectCache.get();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.controls.dragging) return;

        // Mỗi click chỉ phát ĐÚNG MỘT sự kiện chọn — setSelected (phía UI) thay thế
        // toàn bộ selection nên không cần phát kèm null để dọn loại còn lại.
        const _t0 = perfEnabled() ? performance.now() : 0;
        const pick = resolvePick(this.raycaster, this.world, this.meshRegistry, {
            furniture: this.pickObjects,
            wall: this.wallPickObjects,
            room: this.roomPickObjects,
        });
        if (perfEnabled()) perfMark("resolvePick (click raycast)", performance.now() - _t0);

        switch (pick.kind) {
            case "none":
                this.controls.detach();
                this.events?.emit("entitySelected", { entityId: null });
                return;
            case "floor":
                this.controls.detach();
                this.events?.emit("floorSelected", { roomKey: pick.roomKey });
                return;
            case "wall":
                this.controls.detach();
                this.events?.emit("wallSelected", { wallId: pick.wallId });
                return;
            case "furniture":
                this.controls.attach(pick.attachTarget);
                this.applyGizmoAxes(pick.entityId);
                this.events?.emit("entitySelected", { entityId: pick.entityId });
                return;
        }
    };

    /** Chuột phải trên canvas → bỏ chọn mọi thứ + chặn menu ngữ cảnh trình duyệt. */
    private onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        if (this.controls.dragging) return;
        this.clearSelection();
    };

    /**
     * Bỏ chọn mọi thứ trong 3D: gỡ gizmo + phát 3 event null để dọn viền chọn
     * (SelectionHighlight) và đồng bộ store React (useEngineSelectionSync).
     * Dùng cho nút Screenshot và chuột phải.
     */
    clearSelection(): void {
        this.controls.detach();
        this.events?.emit("entitySelected", { entityId: null });
        this.events?.emit("wallSelected", { wallId: null });
        this.events?.emit("floorSelected", { roomKey: null });
        this.requestRender();
    }

    /** Vẽ đường gióng wall-snap (sát sàn) từ guide đầu tiên; ẩn nếu không có. */
    private updateGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        setGuideLine(this.guideLine, guides);
    }

    private hideGuide(): void {
        this.guideLine.visible = false;
    }

    /**
     * Snap quaternion của wall-item về wall-derived rotY theo side hiện tại.
     * Gọi khi kết thúc drag rotate để xác nhận chiều quay cuối cùng.
     */
    private snapWallItemRotation(entity: string): void {
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
        setYawQuaternion(model.root, rotY);
        this.world.markDirty();
    }

    setGizmoMode(mode: "translate" | "rotate"): void {
        if (this.controls.dragging) return;
        this.currentMode = mode;
        this.controls.setMode(mode);
        // Trục gizmo phụ thuộc cả mode → áp lại cho entity đang gắn (nếu có).
        const entity = readEntity(this.controls.object);
        if (entity != null) this.applyGizmoAxes(entity);
        this.events?.emit("gizmoModeChanged", { mode });
        this.requestRender();
    }

    /**
     * Bật/tắt trục gizmo theo loại entity + mode hiện tại:
     *   - Furniture thường: đủ X/Y/Z.
     *   - Wall-item + rotate: CHỈ trục Y (lật đối xứng cửa / đổi mặt kệ) — cấm nghiêng X/Z.
     *   - Wall-item + translate: trượt dọc tường (X/Z, sẽ chiếu về tim tường); kệ (mount)
     *     thêm Y để kéo lên/xuống đổi cao độ, cửa/cửa sổ khoá Y (cao độ theo sill).
     */
    private applyGizmoAxes(entity: string): void {
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
        this.openingPreview.clear();
        this.dragGhostController?.end();
        this.controls.removeEventListener("change", this.requestRender);
        this.rendererDomElement.removeEventListener("mousedown", this.onMouseDown);
        this.rendererDomElement.removeEventListener("contextmenu", this.onContextMenu);
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("pointerdown", this.onPointerTrack, true);
        window.removeEventListener("pointermove", this.onPointerTrack, true);
        this.rectCache.dispose();
        this.controls.detach();
        this.overlayScene.remove(this.controls.getHelper());
        this.controls.dispose();
        disposeGuideLine(this.scene, this.guideLine);
    }

    /**
     * Cập nhật preview CSG tường khi kéo gizmo door/window.
     * Resolve mesh/poly/size + wall theo hostWallId rồi uỷ cho controller quyết định
     * begin-vs-update.
     */
    private updateOpeningPreview(
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

        this.openingPreview.update({
            wallId: hostWallId,
            wallMesh: meshComp.mesh,
            poly: poly.points,
            wallHeight: size.height,
            wall,
            existingOpenings: collectExistingOpenings(this.world, hostWallId, excludeEntity),
            ghostOpening: { t, width: cutWidth, height: cutHeight, sill },
        });
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
