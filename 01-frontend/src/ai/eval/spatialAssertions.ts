/**
 * eval/spatialAssertions — kiểm tra hình học bố cục (WP4-EVAL Tầng A).
 *
 * Assert TRỰC TIẾP bằng AABB, KHÔNG dựa "dispatcher reject" (PLACE_FURNITURE
 * không check va chạm — Sai khác #7). Mỗi hàm trả string[] vi phạm (rỗng = pass)
 * → test dùng expect(checkX(...)).toEqual([]). Thuần, chạy nhanh trong CI.
 */
import type { Placement, FootprintGetter, SolverRoom, Rect } from "src/ai/solver/types";
import { footprintRect, overlaps, insideRoom, inflate } from "src/ai/solver/rect";

function rectsOf(placed: Placement[], getFootprint: FootprintGetter): { p: Placement; rect: Rect }[] {
    return placed.map((p) => ({ p, rect: footprintRect(p.x, p.z, p.rotY, getFootprint(p.modelId)) }));
}

/**
 * Không cặp món nào chồng footprint nhau (chạm mép = OK). Thảm (layer "underlay")
 * nằm DƯỚI đồ → chồng với nó là hợp lệ, bỏ qua mọi cặp dính underlay.
 */
export function checkNoOverlap(placed: Placement[], getFootprint: FootprintGetter): string[] {
    const rs = rectsOf(placed, getFootprint);
    const out: string[] = [];
    for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
            if (rs[i].p.layer === "underlay" || rs[j].p.layer === "underlay") continue;
            if (overlaps(rs[i].rect, rs[j].rect)) {
                out.push(`overlap: ${rs[i].p.modelId}#${i} ↔ ${rs[j].p.modelId}#${j}`);
            }
        }
    }
    return out;
}

/** Mọi món gọn trong phòng. */
export function checkInsideRoom(placed: Placement[], getFootprint: FootprintGetter, room: SolverRoom): string[] {
    const out: string[] = [];
    rectsOf(placed, getFootprint).forEach(({ p, rect }, i) => {
        if (!insideRoom(rect, room)) out.push(`outside-room: ${p.modelId}#${i}`);
    });
    return out;
}

/**
 * Lối đi tối thiểu: không cặp món nào cách nhau < minWalkway. Kiểm bằng cách nới
 * mỗi footprint nửa minWalkway rồi test chồng (2 nửa = khe ≥ minWalkway).
 */
export function checkWalkway(placed: Placement[], getFootprint: FootprintGetter, minWalkway: number): string[] {
    const rs = rectsOf(placed, getFootprint).map(({ p, rect }) => ({ p, rect: inflate(rect, minWalkway / 2) }));
    const out: string[] = [];
    for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
            if (rs[i].p.layer === "underlay" || rs[j].p.layer === "underlay") continue; // thảm không tính lối đi
            if (overlaps(rs[i].rect, rs[j].rect)) {
                out.push(`walkway<${minWalkway}m: ${rs[i].p.modelId}#${i} ↔ ${rs[j].p.modelId}#${j}`);
            }
        }
    }
    return out;
}

/** Không món nào chặn vùng clearance trước cửa. */
export function checkDoorClear(placed: Placement[], getFootprint: FootprintGetter, openingClearances: Rect[]): string[] {
    const rs = rectsOf(placed, getFootprint);
    const out: string[] = [];
    rs.forEach(({ p, rect }, i) => {
        openingClearances.forEach((door, d) => {
            if (overlaps(rect, door)) out.push(`blocks-door#${d}: ${p.modelId}#${i}`);
        });
    });
    return out;
}
