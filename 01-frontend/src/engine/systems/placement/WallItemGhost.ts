import * as THREE from "three";

import type { ModelTemplate } from "src/engine/rendering/GLTFModelLoader";
import type { PlacementSpec } from "src/engine/catalog/FurnitureCatalog";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import { projectPointToWall, wallItemPose, wallItemOverlaps, occupancyLane, type MountWall } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { collectOccupiedRanges } from "src/engine/utils/wallItemRanges";
import { Query } from "src/engine/ecs/Query";
import { Mesh } from "src/engine/components/render/Mesh";
import { WallTag } from "src/engine/components/wall/WallTag";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import {
    WallOpeningPreviewController,
    collectExistingOpenings,
} from "src/engine/systems/wall/WallOpeningPreviewController";
import { setYawQuaternion } from "src/shared/math/yaw";
import type { World } from "src/engine/ecs/World";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/** Mesh tường có gắn ngược entity id để truy ngược wallId từ kết quả raycast. */
type WallPickMesh = THREE.Object3D & { __wallEntity?: string };

/** Phụ thuộc ổn định của ghost bám tường (do FurniturePlacementSystem cung cấp). */
export interface WallGhostDeps {
    world: World;
    nodeRegistry: NodeRegistry;
    /** Raycaster dùng chung — parent đã setFromCamera() trước khi gọi update(). */
    raycaster: THREE.Raycaster;
    /** Scene cho preview CSG. */
    scene: THREE.Scene;
    /** Báo trạng thái va chạm/không hợp lệ về parent (parent sở hữu isColliding + tint). */
    setColliding: (colliding: boolean) => void;
    /** Ẩn đường gióng wall-snap (ghost bám tường không dùng guide). */
    hideGuide: () => void;
}

/** Trạng thái ghost mỗi frame (parent sở hữu vòng đời ghost). */
export interface WallGhostFrame {
    ghost: THREE.Group;
    template: ModelTemplate;
    modelId: string;
    placement: PlacementSpec;
    /** Offset Y gốc của ghost sau chuẩn-hoá-pivot (wall-ghost cộng baseY lên trên). */
    ghostBaseOffsetY: number;
}

/**
 * WallItemGhost — luồng ghost xem-trước cho item bám tường (cửa/cửa sổ/kệ).
 *
 * Tách khỏi FurniturePlacementSystem để file đó chỉ còn một luồng floor-ghost rõ ràng;
 * đường wall-ghost (raycast mặt tường → chiếu tim tường lấy t/side → đặt pose + kiểm
 * tra hợp lệ + preview CSG) gom hết vào đây. Sở hữu: tập mesh tường để raycast, kết quả
 * bám tường hợp lệ (`hit`), và controller preview CSG.
 */
export class WallItemGhost {
    private readonly deps: WallGhostDeps;
    private readonly openingPreview: WallOpeningPreviewController;
    /** Mesh tường để raycast (gom 1 lần lúc begin). */
    private wallPickMeshes: WallPickMesh[] = [];
    /** Kết quả bám tường hợp lệ hiện tại (null = chưa hợp lệ → chặn đặt). */
    private wallHit: { hostWallId: string; t: number; side: number } | null = null;

    constructor(deps: WallGhostDeps) {
        this.deps = deps;
        this.openingPreview = new WallOpeningPreviewController(deps.scene);
    }

    /** Vị trí bám tường hợp lệ hiện tại (null = chặn đặt). */
    get hit(): { hostWallId: string; t: number; side: number } | null {
        return this.wallHit;
    }

    /** Gom mesh tường để raycast (gắn ngược entity id). Gọi ở begin() khi constraint=wall. */
    collectWalls(): void {
        this.wallPickMeshes = [];
        for (const e of Query.entitiesWith(this.deps.world, WallNodes, Mesh)) {
            const meshComp = this.deps.world.getComponent(e, Mesh);
            if (!meshComp) continue;
            (meshComp.mesh as WallPickMesh).__wallEntity = e;
            this.wallPickMeshes.push(meshComp.mesh);
        }
    }

    /**
     * Cập nhật ghost bám tường theo con trỏ (raycaster đã setFromCamera).
     * Raycast mặt tường, chiếu lên tim tường để lấy (t, side), đặt ghost áp/nhúng tường,
     * tính hợp lệ (đặt `hit`), và preview CSG cho item loại "opening".
     */
    update(frame: WallGhostFrame): void {
        const { ghost, template, modelId, placement, ghostBaseOffsetY } = frame;

        const hits = this.deps.raycaster.intersectObjects(this.wallPickMeshes, false);
        if (hits.length === 0) {
            this.clear(ghost);
            return;
        }

        const hit = hits[0];
        const wallEntity = (hit.object as WallPickMesh).__wallEntity;
        if (wallEntity == null) {
            this.clear(ghost);
            return;
        }

        const tag = this.deps.world.getComponent(wallEntity, WallTag);
        const wn = this.deps.world.getComponent(wallEntity, WallNodes);
        const sizeC = this.deps.world.getComponent(wallEntity, WallSize);
        if (!tag || !wn) {
            this.clear(ghost);
            return;
        }
        const a = this.deps.nodeRegistry.get(wn.startNodeId);
        const b = this.deps.nodeRegistry.get(wn.endNodeId);
        if (!a || !b) {
            this.clear(ghost);
            return;
        }

        const wall: MountWall = { wallId: tag.wallId, ax: a.x, az: a.z, bx: b.x, bz: b.z, thickness: wn.thickness };
        const halfWidth = getFootprint2D(modelId).width / 2;
        const { t, side, fits } = projectPointToWall(wall, hit.point.x, hit.point.z, halfWidth);

        // Pose qua nguồn chân lý chung (depth từ footprint catalog), khớp đúng lúc spawn.
        const sy = template.size.y;
        const dims = resolveWallItemDims(modelId, sy);
        const pose = wallItemPose(wall, t, side, dims);

        ghost.position.set(pose.x, ghostBaseOffsetY + pose.baseY, pose.z);
        setYawQuaternion(ghost, pose.rotY);
        ghost.visible = true;
        this.deps.hideGuide();

        // Hợp lệ: tường đủ dài (fits) + lỗ/kệ nằm gọn trong chiều cao tường + không overlap.
        const wallHeight = sizeC?.height ?? Infinity;
        const topExtent = dims.behavior === "opening" ? (placement.cut?.height ?? sy) : sy;
        const topY = pose.baseY + topExtent;
        const heightOk = pose.baseY >= -1e-3 && topY <= wallHeight + 1e-3;

        // Chống chồng lấn: kiểm tra t-range ghost có overlap với items đã đặt.
        const wallLen = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) || 1e-6;
        const halfWidthT = halfWidth / wallLen;
        const occupied = collectOccupiedRanges(this.deps.world, wall.wallId, wallLen, "");
        const lane = occupancyLane(dims.behavior, side);
        const overlapFree = !wallItemOverlaps(t, halfWidthT, lane, occupied);

        const valid = fits && heightOk && overlapFree;

        this.wallHit = valid ? { hostWallId: wall.wallId, t, side } : null;
        this.deps.setColliding(!valid);

        // CSG Preview: chỉ cho item loại "opening" (Door/Window).
        if (dims.behavior === "opening") {
            this.updateOpeningPreview(wallEntity, wall, sizeC, t, dims, modelId, template);
        }
    }

    /**
     * Dọn state mỗi phiên đặt: ẩn/clear preview, gỡ __wallEntity đã gắn lên mesh thật,
     * clear tập mesh + wallHit. Gọi từ FurniturePlacementSystem.cleanup().
     *
     * Gỡ __wallEntity để tránh stale: một tường bị xoá rồi tái tạo với entity id khác có
     * thể để mesh giữ entity id cũ → raycast placement lần sau trả về entity đã chết. (H3)
     */
    reset(): void {
        this.openingPreview.clear();
        for (const m of this.wallPickMeshes) delete (m as WallPickMesh).__wallEntity;
        this.wallPickMeshes = [];
        this.wallHit = null;
    }

    /**
     * Dọn state wall-ghost về "không hợp lệ": ẩn ghost, clear wallHit, tô đỏ (invalid),
     * ẩn preview CSG. Gọi ở mọi nhánh fail của update() để các đường thoát reset đồng nhất.
     */
    private clear(ghost: THREE.Group): void {
        ghost.visible = false;
        this.wallHit = null;
        this.deps.setColliding(true);
        this.openingPreview.hide();
    }

    /**
     * Cập nhật preview CSG tường cho item loại "opening".
     * Resolve mesh/poly/size rồi uỷ cho controller quyết định begin-vs-update.
     */
    private updateOpeningPreview(
        wallEntity: string,
        wall: MountWall,
        sizeC: WallSize | undefined,
        t: number,
        dims: ReturnType<typeof resolveWallItemDims>,
        modelId: string,
        template: ModelTemplate,
    ): void {
        const meshComp = this.deps.world.getComponent(wallEntity, Mesh);
        const poly = this.deps.world.getComponent(wallEntity, WallPolygon);
        const size = sizeC ?? this.deps.world.getComponent(wallEntity, WallSize);
        if (!meshComp || !poly || !size) { this.openingPreview.hide(); return; }

        this.openingPreview.update({
            wallId: wall.wallId,
            wallMesh: meshComp.mesh,
            poly: poly.points,
            wallHeight: size.height,
            wall,
            // Ghost chưa phải entity nên không cần loại trừ.
            existingOpenings: collectExistingOpenings(this.deps.world, wall.wallId),
            ghostOpening: {
                t,
                width: getFootprint2D(modelId).width,
                height: dims.height > 0 ? dims.height : (template.size.y ?? 2.1),
                sill: dims.sill,
            },
        });
    }
}
