/**
 * GizmoContext — mặt cắt chia sẻ giữa GizmoSystem (orchestrator) và các collaborator
 * (GizmoPicking / WallItemGizmoAdapter / GizmoDragLifecycle) tách ra ở Phase 5.4.
 *
 * Mục đích: collaborator KHÔNG phụ thuộc trực tiếp lẫn nhau — chúng chỉ đọc/gọi qua
 * context. GizmoSystem là chỗ DUY NHẤT hiện thực context (delegate sang nội bộ hoặc
 * sang collaborator khác), nên không có vòng phụ thuộc và mỗi mảnh test/đọc độc lập.
 *
 * `world`/`mode` là getter (thay đổi theo frame / setGizmoMode) — collaborator luôn đọc
 * giá trị mới nhất tại thời điểm xử lý event.
 */
import * as THREE from "three";
import type { World } from "src/engine/ecs/World";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import type { CachedClientRect } from "src/shared/dom/cachedRect";
import type { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";
import type { DragGhostController } from "src/engine/systems/gizmo/DragGhostController";
import type { PointerRotateTracker } from "src/engine/systems/gizmo/pointerRotate";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";

export type GizmoMode = "translate" | "rotate";

export interface GizmoGuide {
    x1: number; z1: number; x2: number; z2: number;
}

export interface GizmoContext {
    readonly controls: TransformControls;
    readonly camera: THREE.Camera;
    readonly nodeRegistry: NodeRegistry;
    readonly meshRegistry: MeshRegistry;
    readonly collisionSystem: CannonCollisionSystem;
    readonly dragGhost: DragGhostController;
    readonly pointerRotate: PointerRotateTracker;
    readonly rectCache: CachedClientRect;
    readonly events?: EngineEvents;

    /** World hiện tại (GizmoSystem.update set mỗi frame). */
    readonly world: World;
    /** Mode gizmo hiện tại (đổi qua setGizmoMode). */
    readonly mode: GizmoMode;

    /** On-demand render: báo cần vẽ lại 1 frame (CR-03). */
    requestRender(): void;
    /** Vẽ đường gióng wall-snap (sát sàn); rỗng = ẩn. */
    updateGuide(guides: GizmoGuide[]): void;
    /** Ẩn đường gióng wall-snap. */
    hideGuide(): void;

    /** Áp trục gizmo theo loại entity + mode (do WallItemGizmoAdapter hiện thực). */
    applyGizmoAxes(entity: string): void;
    /** Snap quaternion wall-item về wall-derived rotY (WallItemGizmoAdapter). */
    snapWallItemRotation(entity: string): void;
    /** Dọn CSG opening preview của tường (WallItemGizmoAdapter). */
    clearOpeningPreview(): void;

    /** Mở transaction undo (callback do engine cấp qua setCommandCallbacks). */
    beginTransaction(label: string): void;
    /** Đóng transaction undo. */
    commitTransaction(): void;
}
