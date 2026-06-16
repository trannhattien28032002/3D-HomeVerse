/**
 * wallOccupancy — pure utility tính occupied t-ranges cho wall items.
 *
 * Không phụ thuộc ECS World — nhận data thuần để cả engine lẫn 2D tool dùng được.
 * Song song với `wallItemRanges.collectOccupiedRanges` (bản ECS-coupled, đọc World)
 * nhưng phiên bản này nhận data thuần nên không cần World context.
 *
 * Dùng để:
 *   - WallPlacementTool (2D): check overlap khi di chuyển ghost trên tường.
 *   - Engine placement: check overlap khi đặt item mới (cũng dùng qua gizmoHandles).
 */
import { wallItemOverlaps, occupancyLane, type WallItemRange } from "src/shared/geometry/wallMount";

export type WallItemOccupancy = {
    /** Vị trí dọc tim tường, 0..1. */
    t: number;
    /** Nửa bề rộng item, tính bằng đơn vị t (= width_m / wallLength_m / 2). */
    halfWidthT: number;
    /** Lane occupancy (xem occupancyLane): +1/−1 một mặt, 0 = cả hai mặt (cửa/cửa sổ). */
    lane: number;
};

/**
 * Tính occupied t-ranges (kèm lane) từ danh sách wall items thuần.
 * Trả về mảng {tMin, tMax, lane} không phụ thuộc ECS.
 */
export function buildOccupiedRanges(items: WallItemOccupancy[]): WallItemRange[] {
    return items.map(item => ({
        tMin: item.t - item.halfWidthT,
        tMax: item.t + item.halfWidthT,
        lane: item.lane,
    }));
}

/**
 * Kiểm tra item (lane `lane`) tại `t` ± `halfWidthT` có xung đột chỗ với range nào không.
 * Delegate sang {@link wallItemOverlaps} (nguồn chân lý) để không fork quy tắc xung đột.
 */
export function occupiedOverlaps(t: number, halfWidthT: number, lane: number, ranges: WallItemRange[]): boolean {
    return wallItemOverlaps(t, halfWidthT, lane, ranges);
}

/** Một wall-item tối giản để kiểm tra overlap (thuần, không phụ thuộc ECS/snapshot). */
export type WallItemForOverlap = {
    hostWallId: string;
    /** Vị trí dọc tim tường, 0..1. */
    t: number;
    /** Bề rộng item dọc thân tường (mét). */
    width: number;
    behavior: "opening" | "mount";
    side: number;
};

/**
 * Tìm các item BỊ CHỒNG chỗ với item khác trên CÙNG tường — trả về Set index (theo
 * thứ tự `items`). Dùng đúng quy tắc lane/overlap với placement & drag (qua
 * {@link wallItemOverlaps}) nên KHÔNG fork: cửa (lane 0) đụng mọi lane; kệ 2 mặt
 * khác nhau không đụng.
 *
 * `wallLengths`: map hostWallId → chiều dài tim tường (mét), để quy width→t-space.
 * Dùng cho "flag đỏ" cảnh báo overlap sau resize/merge (derived ở SnapshotSystem).
 *
 * ĐỘ PHỨC TẠP: O(k²) với k = số item TRÊN CÙNG MỘT TƯỜNG (không phải tổng số item) —
 * các item đã được gom theo `hostWallId` trước. Ở quy mô nhà ở k thường ≤ ~6 nên chi
 * phí không đáng kể dù chạy mỗi snapshot (lúc drag). NGƯỠNG: nếu một tường có thể chứa
 * hàng chục item (vd panel ghép dày đặc), nên đổi sang quét sau khi sort theo t
 * (sweep-line) để hạ về O(k log k). (M2)
 */
export function findOverlappingWallItems(
    items: WallItemForOverlap[],
    wallLengths: Map<string, number>,
): Set<number> {
    const overlapping = new Set<number>();
    const byWall = new Map<string, number[]>();
    items.forEach((it, i) => {
        const arr = byWall.get(it.hostWallId);
        if (arr) arr.push(i);
        else byWall.set(it.hostWallId, [i]);
    });
    for (const [wallId, idxs] of byWall) {
        const len = wallLengths.get(wallId);
        if (!len || len <= 0 || idxs.length < 2) continue;
        for (let a = 0; a < idxs.length; a++) {
            for (let b = a + 1; b < idxs.length; b++) {
                const A = items[idxs[a]];
                const B = items[idxs[b]];
                const bRange: WallItemRange = {
                    tMin: B.t - (B.width / 2) / len,
                    tMax: B.t + (B.width / 2) / len,
                    lane: occupancyLane(B.behavior, B.side),
                };
                if (wallItemOverlaps(A.t, (A.width / 2) / len, occupancyLane(A.behavior, A.side), [bRange])) {
                    overlapping.add(idxs[a]);
                    overlapping.add(idxs[b]);
                }
            }
        }
    }
    return overlapping;
}
