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
import { quatToYaw } from "src/shared/math/yaw";
import { isTypingTarget } from "src/shared/dom/isTypingTarget";
import { type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { collectWallSegments } from "src/engine/adapters/wallSegments";
import { collectFurnitureBoxes } from "src/engine/adapters/furnitureBoxes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import {
    readEntity,
    applyRotateCheck,
    isWallItem,
    handleFurnitureTranslate,
} from "src/engine/systems/gizmo/gizmoHandles";
import { GizmoHeld } from "src/engine/components/interaction/GizmoHeld";
import { GizmoPicking } from "src/engine/systems/gizmo/GizmoPicking";
import { WallItemGizmoAdapter } from "src/engine/systems/gizmo/WallItemGizmoAdapter";
import type { GizmoContext, GizmoGuide } from "src/engine/systems/gizmo/gizmoContext";
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";
import type { RenderScheduler } from "src/engine/rendering/RenderScheduler";


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

    /** Picking (input→event): chuột trái chọn/attach, chuột phải bỏ chọn (Phase 5.4). */
    private picking!: GizmoPicking;
    /** Mặt cắt chia sẻ cho các collaborator (picking/...). */
    private ctx!: GizmoContext;
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

    /** Ứng xử riêng wall-item (slide/flip/snap-rotation/axes/CSG preview) — Phase 5.4. */
    private wallAdapter!: WallItemGizmoAdapter;

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

        // Mặt cắt chia sẻ + collaborator (Phase 5.4). ctx delegate sang nội bộ GizmoSystem
        // (hoặc collaborator khác) → không vòng phụ thuộc.
        this.ctx = this.createContext();
        this.picking = new GizmoPicking(this.ctx);
        this.wallAdapter = new WallItemGizmoAdapter(this.ctx, scene);

        this.controls.addEventListener("dragging-changed", this.onDraggingChanged);
        this.controls.addEventListener("objectChange", this.onObjectChange);
        // On-demand render: gizmo phát "change" khi hover đổi trục, lúc kéo, và mỗi
        // updateMatrixWorld → cần vẽ lại frame đó (các thay đổi này không bump revision).
        this.controls.addEventListener("change", this.requestRender);

        this.rendererDomElement.addEventListener("mousedown", this.picking.onMouseDown);
        // Chuột phải = bỏ chọn mọi thứ (và chặn menu ngữ cảnh mặc định của trình duyệt).
        this.rendererDomElement.addEventListener("contextmenu", this.picking.onContextMenu);
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
     * Dựng GizmoContext — mặt cắt chia sẻ cho collaborator. world/mode là getter (đọc
     * giá trị mới nhất). Các method delegate sang nội bộ GizmoSystem (hoặc collaborator
     * khác khi đã tách) — xem gizmoContext.ts.
     */
    private createContext(): GizmoContext {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const sys = this; // getter world/mode cần `this` của GizmoSystem (không phải object literal)
        return {
            controls: this.controls,
            camera: this.camera,
            nodeRegistry: this.nodeRegistry,
            meshRegistry: this.meshRegistry,
            collisionSystem: this.collisionSystem,
            dragGhost: this.dragGhostController,
            pointerRotate: this.pointerRotate,
            rectCache: this.rectCache,
            events: this.events,
            get world() { return sys.world; },
            get mode() { return sys.currentMode; },
            requestRender: () => this.requestRender(),
            updateGuide: (guides) => this.updateGuide(guides),
            hideGuide: () => this.hideGuide(),
            applyGizmoAxes: (entity) => this.wallAdapter.applyGizmoAxes(entity),
            snapWallItemRotation: (entity) => this.wallAdapter.snapWallItemRotation(entity),
            clearOpeningPreview: () => this.wallAdapter.clearOpeningPreview(),
            beginTransaction: (label) => this.onBeginTransaction?.(label),
            commitTransaction: () => this.onCommitTransaction?.(),
        };
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
                this.wallAdapter.snapWallItemRotation(e);
            }
            // Sau translate: dọn ghost (ghost được tạo ở drag-start cho translate).
            if (this.currentMode === "translate") {
                this.dragGhostController?.end();
            }
            this.wallAdapter.clearOpeningPreview();
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

        // Wall-item (cửa/kệ): cập nhật topology (t/side) + ghim mesh vào tường + CSG preview,
        // KHÔNG đi đường furniture (alignment/collision/ghost). Toàn bộ ở WallItemGizmoAdapter.
        if (isWallItem(this.world, entity)) {
            this.wallAdapter.handleObjectChange(entity, object);
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

    /**
     * Bỏ chọn mọi thứ trong 3D (delegate sang GizmoPicking). Public vì engine.api
     * dùng cho nút Screenshot. Xem GizmoPicking.clearSelection.
     */
    clearSelection(): void {
        this.picking.clearSelection();
    }

    /** Vẽ đường gióng wall-snap (sát sàn) từ guide đầu tiên; ẩn nếu không có. */
    private updateGuide(guides: GizmoGuide[]): void {
        setGuideLine(this.guideLine, guides);
    }

    private hideGuide(): void {
        this.guideLine.visible = false;
    }

    setGizmoMode(mode: "translate" | "rotate"): void {
        if (this.controls.dragging) return;
        this.currentMode = mode;
        this.controls.setMode(mode);
        // Trục gizmo phụ thuộc cả mode → áp lại cho entity đang gắn (nếu có).
        const entity = readEntity(this.controls.object);
        if (entity != null) this.wallAdapter.applyGizmoAxes(entity);
        this.events?.emit("gizmoModeChanged", { mode });
        this.requestRender();
    }

    dispose() {
        this.wallAdapter.clearOpeningPreview();
        this.dragGhostController?.end();
        this.controls.removeEventListener("change", this.requestRender);
        this.rendererDomElement.removeEventListener("mousedown", this.picking.onMouseDown);
        this.rendererDomElement.removeEventListener("contextmenu", this.picking.onContextMenu);
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("pointerdown", this.onPointerTrack, true);
        window.removeEventListener("pointermove", this.onPointerTrack, true);
        this.rectCache.dispose();
        this.controls.detach();
        this.overlayScene.remove(this.controls.getHelper());
        this.controls.dispose();
        disposeGuideLine(this.scene, this.guideLine);
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
