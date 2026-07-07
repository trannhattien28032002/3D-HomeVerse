/**
 * wallItemDrag2D — chiếu con trỏ lên tường gần nhất để ĐẶT (WallPlacementTool) hoặc
 * DI CHUYỂN (FurnitureLayer) một wall-item (cửa / cửa sổ / kệ) trong PlanView2D.
 *
 * NGUỒN CHÂN LÝ DUY NHẤT cho toán chiếu điểm→tường ở 2D — cả 2 luồng dùng chung để
 * không fork logic (quy ước side / t / rotation phải khớp engine `wallItemPose`).
 *
 *   - `t`    : 0..1 dọc tim tường, đã clamp khỏi 2 đầu theo nửa-bề-rộng item.
 *   - `side` : +1 / −1 theo dấu pháp tuyến tường (n = rot90(u)). Khi DI CHUYỂN, caller
 *              truyền `fixedSide` để GIỮ mặt hiện tại (flip là thao tác xoay riêng).
 *   - `rotDeg`: góc Konva khớp engine = threeRotYToKonvaDeg(atan2(side·nx, side·nz)),
 *              để preview lúc kéo không "nhảy" khi commit.
 *
 * Hysteresis khi di chuyển: tường hiện tại được ưu tiên bởi WALL_STICKY_MARGIN (m)
 * để tránh jitter sát góc giao tường. Khi nhảy sang tường mới, `side` được tính lại
 * từ phía con trỏ thay vì giữ `fixedSide` (tường mới có winding khác).
 */
import { PX_PER_WORLD, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { occupancyLane, wallItemOffset, clampWallItemT, type WallItemDims } from "src/shared/geometry/wallMount";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Wall2D, Node2D, Furniture2D } from "src/app/features/plan2d/types";
import type { WallItemOccupancy } from "src/engine/utils/wallOccupancy";

/** Khoảng cách (m) cửa phải gần tường mới hơn tường hiện tại mới chịu chuyển — hết jitter góc. */
const WALL_STICKY_MARGIN = 0.15;

export type WallItemPlacement2D = {
    hostWallId: string;
    /** Vị trí dọc tim tường, 0..1 (đã clamp khỏi 2 đầu). */
    t: number;
    /** Mặt tường: +1 / −1. */
    side: number;
    /** Tâm px trên tim tường tại `t`. */
    cx: number;
    cy: number;
    /** Hướng tường (Konva deg) — ghost rect nằm dọc thân tường. */
    angleDeg: number;
    /** Konva rotation khớp engine rotY (đã tính theo `side`). */
    rotDeg: number;
    /** Chiều dài tường (mét). */
    wallLen: number;
    /** Nửa bề rộng item theo đơn vị t = (footprintWidth/2)/wallLen. */
    halfWidthT: number;
};

/**
 * Tìm tường gần con trỏ nhất rồi chiếu lên tim tường.
 * @param fixedSide nếu truyền → dùng làm `side` (giữ mặt khi di chuyển); bỏ trống →
 *                  suy `side` từ phía con trỏ so với tường (đặt mới).
 * @param currentWallId tường cửa đang bám — kích hoạt hysteresis (cửa chỉ nhảy tường
 *                      khi tường mới gần hơn ít nhất WALL_STICKY_MARGIN). Khi nhảy, `side`
 *                      được tính lại từ phía con trỏ bất kể `fixedSide`.
 * @param dims khi truyền → DỊCH tâm (cx/cy) ra ngoài theo pháp tuyến đúng bằng offset bám
 *             tường của engine (mount: thickness + depth/2 + faceGap; opening: 0) để
 *             preview/ghost khớp pose thật (WallMountSystem) — không nằm chìm trong tường.
 * @returns null nếu không có tường nào.
 */
export function projectToNearestWall(
    walls: Wall2D[],
    nodeById: Map<string, Node2D>,
    worldX: number,
    worldZ: number,
    transform: PlanTransform,
    footprintWidth: number,
    fixedSide?: number,
    currentWallId?: string,
    dims?: WallItemDims,
): WallItemPlacement2D | null {
    let bestWall: Wall2D | null = null;
    let bestT = 0.5;
    let bestDist = Infinity;
    let bestProjX = 0;
    let bestProjZ = 0;

    for (const wall of walls) {
        const a = nodeById.get(wall.startNodeId);
        const b = nodeById.get(wall.endNodeId);
        if (!a || !b) continue;

        const ax = transform.toWorldX(a.x);
        const az = transform.toWorldZ(a.y);
        const bx = transform.toWorldX(b.x);
        const bz = transform.toWorldZ(b.y);

        const dx = bx - ax;
        const dz = bz - az;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 1e-12) continue;

        const tRaw = ((worldX - ax) * dx + (worldZ - az) * dz) / lenSq;
        const t = Math.max(0, Math.min(1, tRaw));
        const projX = ax + t * dx;
        const projZ = az + t * dz;
        const dist = Math.hypot(worldX - projX, worldZ - projZ);

        // Ưu tiên tường hiện tại: trừ bias để tường khác phải gần hơn MARGIN mới thắng.
        const bias = (currentWallId && wall.id === currentWallId) ? -WALL_STICKY_MARGIN : 0;
        if (dist + bias < bestDist) {
            bestDist = dist + bias;
            bestWall = wall;
            bestT = t;
            bestProjX = projX;
            bestProjZ = projZ;
        }
    }

    if (!bestWall) return null;

    const a = nodeById.get(bestWall.startNodeId)!;
    const b = nodeById.get(bestWall.endNodeId)!;
    const ax = transform.toWorldX(a.x);
    const az = transform.toWorldZ(a.y);
    const bx = transform.toWorldX(b.x);
    const bz = transform.toWorldZ(b.y);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;

    const cursorSide = (worldX - bestProjX) * nx + (worldZ - bestProjZ) * nz >= 0 ? 1 : -1;
    // Khi nhảy sang tường mới, tính lại side từ con trỏ (tường mới có winding khác).
    const wallChanged = currentWallId !== undefined && bestWall.id !== currentWallId;
    const side = (wallChanged || fixedSide === undefined) ? cursorSide : fixedSide;

    const halfWidth = footprintWidth / 2;
    const minT = len > 0 ? halfWidth / len : 0;
    const maxT = len > 0 ? 1 - halfWidth / len : 1;
    // Clamp biên dùng chung với engine (resolveWallItemT reject) — không fork 3 bản.
    const t = clampWallItemT(bestT, minT, maxT);

    // Tâm trên tim tường tại t, rồi DỊCH RA NGOÀI theo pháp tuyến đúng bằng offset bám
    // tường (mount: thickness + depth/2 + faceGap; opening: 0) để preview/ghost khớp pose
    // engine — không còn nằm chìm trong tường khi đặt/kéo kệ treo.
    const offset = dims ? wallItemOffset(bestWall.thickness, dims) : 0;
    const cWX = ax + dx * t + nx * side * offset;
    const cWZ = az + dz * t + nz * side * offset;
    const cx = transform.toPxX(cWX);
    const cy = transform.toPxY(cWZ);
    const angleDeg = Math.atan2(dz, dx) * (180 / Math.PI);
    const rotDeg = threeRotYToKonvaDeg(Math.atan2(side * nx, side * nz));

    return { hostWallId: bestWall.id, t, side, cx, cy, angleDeg, rotDeg, wallLen: len, halfWidthT: halfWidth / len };
}

/**
 * Gom occupancy của các opening đã đặt trên cùng tường (trừ `excludeEntityId`).
 * Dùng để check chồng lấn khi đặt mới / di chuyển cửa.
 */
export function buildOpeningOccupancy(
    furniture: Furniture2D[],
    wallId: string,
    wallLen: number,
    excludeEntityId?: string,
): WallItemOccupancy[] {
    const out: WallItemOccupancy[] = [];
    for (const f of furniture) {
        if (f.entityId === excludeEntityId) continue;
        if (!f.isWallItem || f.hostWallId !== wallId || f.wallT === undefined) continue;
        const widthM = (f.cutWidthPx ?? f.width) / PX_PER_WORLD;
        const lane = occupancyLane(f.wallBehavior ?? "mount", f.wallSide ?? 1);
        out.push({ t: f.wallT, halfWidthT: (widthM / 2) / wallLen, lane });
    }
    return out;
}
