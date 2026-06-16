import type { Vec2 } from "src/shared/types/primitives";

/** Điểm 2D (px hoặc m tuỳ caller). Alias của {@link Vec2} — single source of truth. */
export type Pt = Vec2;
export type Poly = Pt[];

/**
 * 4 đỉnh của một hình chữ nhật xoay (OBB) quanh tâm (cx, cy).
 *
 * @param rotDeg góc xoay theo chiều kim đồng hồ (Konva convention).
 *               Engine layer dùng metres + rotY radians thì caller phải convert
 *               sang deg trước khi gọi (xem shared/math/coords).
 */
export function obbCorners(cx: number, cy: number, w: number, d: number, rotDeg: number): Poly {
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = w / 2;
    const hd = d / 2;
    // Góc cục bộ (±hw, ±hd) → xoay → dịch về tâm.
    const local: Pt[] = [
        { x: -hw, y: -hd },
        { x:  hw, y: -hd },
        { x:  hw, y:  hd },
        { x: -hw, y:  hd },
    ];
    return local.map(p => ({
        x: cx + p.x * cos - p.y * sin,
        y: cy + p.x * sin + p.y * cos,
    }));
}

/**
 * OBB 4-corners của một đoạn (segment) với độ dày `thickness`.
 * Dùng cho preview tường đang vẽ (chưa commit) trong DrawWallTool.
 *
 * Trả về polygon rỗng nếu segment có độ dài < 1e-6 (caller có thể skip).
 */
export function wallSegmentPolygon(start: Pt, end: Pt, thickness: number): Poly {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];
    // Pháp tuyến đơn vị → nửa bề dày.
    const nx = (-dy / len) * (thickness / 2);
    const ny = ( dx / len) * (thickness / 2);
    return [
        { x: start.x + nx, y: start.y + ny },
        { x: end.x   + nx, y: end.y   + ny },
        { x: end.x   - nx, y: end.y   - ny },
        { x: start.x - nx, y: start.y - ny },
    ];
}

/**
 * SAT cho hai polygon LỒI. Trả về true khi 2 polygon chồng lấn THỰC SỰ
 * (đã trừ khe hở `gap`). Chạm mép trong khoảng `gap` được coi là KHÔNG va chạm.
 *
 * @param a polygon lồi A
 * @param b polygon lồi B
 * @param gap khe hở "chạm mép cho phép" — cùng đơn vị với polygon (px hoặc m).
 *            Default 0 = strict SAT (true SAT).
 */
export function polygonsIntersect(a: Poly, b: Poly, gap: number = 0): boolean {
    if (a.length < 3 || b.length < 3) return false;
    const axes: Pt[] = [];
    edgeAxes(a, axes);
    edgeAxes(b, axes);
    for (const axis of axes) {
        const pa = project(a, axis);
        const pb = project(b, axis);
        // Có khe hở ⇒ tồn tại trục tách ⇒ KHÔNG va chạm.
        if (pa.max <= pb.min + gap || pb.max <= pa.min + gap) return false;
    }
    return true;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Chiếu polygon lên một trục (đã chuẩn hoá), trả về [min, max]. */
function project(poly: Poly, axis: Pt): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (const p of poly) {
        const v = p.x * axis.x + p.y * axis.y;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return { min, max };
}

/** Gom các trục pháp tuyến (đã chuẩn hoá) của các cạnh một polygon lồi. */
function edgeAxes(poly: Poly, out: Pt[]): void {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        // Pháp tuyến đơn vị — để gap tính đúng theo cùng đơn vị với polygon.
        out.push({ x: -ey / len, y: ex / len });
    }
}
