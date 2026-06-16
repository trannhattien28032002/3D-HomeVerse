import * as THREE from "three";
import { World } from "src/engine/ecs/World";
import { Model3D } from "src/engine/components/render/Model3D";
import { Mesh } from "src/engine/components/render/Mesh";
import { GhostMaterialSet } from "src/engine/rendering/GhostMaterials";

interface IntendedPose {
    x: number;
    y: number;
    z: number;
    qx?: number;
    qy?: number;
    qz?: number;
    qw?: number;
}

/**
 * DragGhostController — quản lý "bóng ma" (ghost) xem-trước khi kéo bằng Gizmo.
 *
 * Vòng đời mỗi phiên kéo:
 *   begin(world, entityId)  → clone hình của entity thành ghost trong suốt, add vào scene
 *   update(pose, colliding) → đặt lại vị trí ghost mỗi objectChange; tô đỏ khi va chạm
 *   hide()                  → ẩn mà không huỷ (con trỏ về vùng trống)
 *   end()                   → huỷ ghost khi kết thúc kéo
 *
 * Vật liệu ghost (clone trong suốt + tint va chạm) ủy thác cho {@link GhostMaterialSet}
 * dùng chung với FurniturePlacementSystem; controller này chỉ lo pose + vòng đời.
 */
export class DragGhostController {
    private readonly scene: THREE.Scene;
    private ghostRoot: THREE.Object3D | null = null;
    private materials: GhostMaterialSet | null = null;
    private lastColliding: boolean | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Clone root hiển thị của entity, áp vật liệu ghost, add vào scene.
     * Gọi end() trước để thay an toàn ghost còn sót từ phiên trước.
     */
    begin(world: World, entityId: string): void {
        this.end();

        const modelComp = world.getComponent(entityId, Model3D);
        const meshComp = world.getComponent(entityId, Mesh);
        const sourceRoot = modelComp?.root ?? meshComp?.mesh ?? null;
        if (!sourceRoot) return;

        const ghost = sourceRoot.clone(true);
        this.materials = GhostMaterialSet.apply(ghost);

        ghost.visible = false;
        this.scene.add(ghost);
        this.ghostRoot = ghost;
        this.lastColliding = null;
    }

    /**
     * Đặt ghost về pose mong muốn và cập nhật tint.
     * Việc duyệt đổi màu chỉ chạy khi trạng thái lật (va chạm ↔ trống) — không phải mọi lần.
     */
    update(intended: IntendedPose, isColliding: boolean): void {
        const ghost = this.ghostRoot;
        if (!ghost) return;

        ghost.position.set(intended.x, intended.y, intended.z);
        if (intended.qx !== undefined) ghost.quaternion.set(intended.qx, intended.qy!, intended.qz!, intended.qw!);
        ghost.visible = true;

        if (isColliding !== this.lastColliding) {
            this.lastColliding = isColliding;
            this.materials?.setColliding(isColliding);
        }
    }

    /** Ẩn ghost mà không huỷ — dùng khi con trỏ về vùng trống. */
    hide(): void {
        if (this.ghostRoot) this.ghostRoot.visible = false;
        // Reset tint để lần hiện lại ghost tiếp theo không còn màu đỏ cũ.
        this.materials?.setColliding(false);
        this.lastColliding = null;
    }

    /** Gỡ ghost khỏi scene và dispose vật liệu đã clone. Gọi khi kết thúc kéo. */
    end(): void {
        if (this.ghostRoot) {
            this.scene.remove(this.ghostRoot);
            GhostMaterialSet.disposeClonedMaterials(this.ghostRoot);
            this.ghostRoot = null;
        }
        this.materials = null;
        this.lastColliding = null;
    }

    dispose(): void {
        this.end();
    }
}
