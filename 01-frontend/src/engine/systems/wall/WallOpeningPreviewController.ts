/**
 * WallOpeningPreviewController — bọc WallOpeningPreview với logic begin-vs-update.
 *
 * Theo dõi wallId + hash các lỗ cũ đang preview; tự gọi begin() (pre-compute lại
 * baseGeo) khi đổi tường hoặc tập lỗ cũ thay đổi, ngược lại chỉ update() lỗ ghost.
 *
 * Trước đây GizmoSystem (kéo cửa/cửa sổ) và FurniturePlacementSystem (đặt cửa/cửa sổ)
 * mỗi nơi tự giữ một bản sao state activePreviewWallId/activePreviewOpeningsHash và
 * tự lặp lại quyết định begin-vs-update — hai bản còn hash KHÁC nhau (Gizmo hash đủ
 * t/width/height/sill, Placement chỉ hash t) nên dễ lệch hành vi. Controller này gom
 * về một chỗ và thống nhất dùng hash 4-trường.
 */
import * as THREE from "three";

import { WallOpeningPreview } from "src/engine/systems/wall/WallOpeningPreview";
import type { OpeningCut } from "src/engine/systems/wall/wallOpeningCutter";
import type { Point2D } from "src/engine/components/wall/WallPolygon";
import type { MountWall } from "src/shared/geometry/wallMount";
import { Query } from "src/engine/ecs/Query";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import type { World } from "src/engine/ecs/World";

/** Hash đủ 4 trường của các lỗ cũ để phát hiện thay đổi cần rebuild baseGeo. */
function hashOpenings(openings: OpeningCut[]): string {
    return openings
        .map((o) => `${o.t.toFixed(4)},${o.width.toFixed(3)},${o.height.toFixed(3)},${o.sill.toFixed(3)}`)
        .sort()
        .join("|");
}

/**
 * Gom các lỗ THẬT (WallOpening) trên một tường, bỏ qua entity đang kéo/đặt.
 *
 * Chỉ tính WallOpening — KHÔNG dùng occupancy (gồm cả kệ WallMounted). Kệ không
 * khoét tường; nếu trừ kệ vào baseGeo sẽ thấy tường THỦNG ngay tại vị trí kệ trong
 * lúc kéo cửa. Mỗi lỗ giữ đúng width/height/sill của chính nó (không ép theo lỗ
 * đang kéo/đặt).
 */
export function collectExistingOpenings(
    world: World,
    hostWallId: string,
    excludeEntity?: string,
): OpeningCut[] {
    const out: OpeningCut[] = [];
    for (const e of Query.entitiesWith(world, WallOpening)) {
        if (excludeEntity != null && e === excludeEntity) continue;
        const wo = world.getComponent(e, WallOpening)!;
        if (wo.hostWallId !== hostWallId) continue;
        out.push({ t: wo.t, width: wo.width, height: wo.height, sill: wo.sill });
    }
    return out;
}

/** Đầu vào đã resolve cho một frame preview. */
export interface OpeningPreviewInput {
    /** wallId của tường host (để detect đổi tường). */
    wallId: string;
    /** Mesh tường thật (sẽ bị ẩn khi preview hiển thị). */
    wallMesh: THREE.Mesh;
    /** Polygon tường (world-space XZ). */
    poly: Point2D[];
    /** Chiều cao tường (mét). */
    wallHeight: number;
    /** Thông số vị trí/hướng/độ dày tường. */
    wall: MountWall;
    /** Các lỗ đã commit trên tường (xem collectExistingOpenings). */
    existingOpenings: OpeningCut[];
    /** Lỗ ghost đang kéo/đặt. */
    ghostOpening: OpeningCut;
}

export class WallOpeningPreviewController {
    private readonly preview: WallOpeningPreview;
    /** wallId đang preview — đổi tường → begin() lại. */
    private activeWallId: string | null = null;
    /** Hash lỗ cũ lúc begin() lần cuối — đổi → begin() lại. */
    private activeHash = "";

    constructor(scene: THREE.Scene) {
        this.preview = new WallOpeningPreview(scene);
    }

    /**
     * Cập nhật preview cho frame hiện tại. begin() lại nếu đổi tường hoặc tập lỗ cũ
     * thay đổi (rebuild baseGeo); ngược lại chỉ update() lỗ ghost.
     */
    update(input: OpeningPreviewInput): void {
        const hash = hashOpenings(input.existingOpenings);
        if (this.activeWallId !== input.wallId || this.activeHash !== hash) {
            this.preview.begin(input.wallMesh, input.poly, input.wallHeight, input.wall, input.existingOpenings);
            this.activeWallId = input.wallId;
            this.activeHash = hash;
        }
        this.preview.update(input.ghostOpening);
    }

    /** Ẩn preview (restore wall thật) + quên tường đang active; phiên vẫn sống. */
    hide(): void {
        this.preview.hide();
        this.activeWallId = null;
        this.activeHash = "";
    }

    /** Dọn toàn bộ preview + reset state. Gọi khi kết thúc kéo/đặt hoặc dispose. */
    clear(): void {
        this.preview.dispose();
        this.activeWallId = null;
        this.activeHash = "";
    }
}
