/**
 * alignment — NGUỒN CHÂN LÝ DUY NHẤT cho việc căn chỉnh vị trí nội thất.
 *
 * Pure, world-space (mét), không phụ thuộc engine/React/Konva/THREE → unit-test
 * dễ và dùng chung cho cả 2D (Konva) lẫn 3D (gizmo) lẫn command handler.
 *
 * Hai lớp căn chỉnh, áp theo thứ tự:
 *   1. Edge-snap lưới: snap sao cho MÉP (cạnh AABB) của vật rơi vào lưới SNAP_M
 *      (thay vì snap tâm) → các món tile phẳng mép trên lưới.
 *   2. Wall-snap: nếu mép vật nằm trong dung sai mặt trong một bức tường → hút
 *      mép áp sát mặt tường (override lưới theo phương pháp tuyến của tường).
 *      OBB-aware: chiếu nửa-kích-thước theo trục local của vật lên pháp tuyến.
 *
 * Trả thêm `guides` (đoạn thẳng world-space) để view vẽ đường gióng feedback.
 *
 * Xem docs/SNAP-M-AUDIT-PLAN.md + SNAP-M-NEXT-STEPS-PLAN.md.
 */
import {
    snapToGridM,
    WALL_SNAP_TOL_M,
    WALL_SNAP_GAP_M,
} from "src/shared/constants/placement";

/** Đoạn tâm tường + bề dày (world-space, mặt phẳng XZ, mét). */
export interface WallSegment {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    thickness: number;
}

/** Đường gióng feedback khi snap (world-space XZ). */
export interface AlignGuide {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    /** "wall" = hút mặt tường; "neighbor" = thẳng hàng mép đồ lân cận. */
    kind: "wall" | "neighbor";
}

/** Hộp footprint của một món đồ lân cận (world-space, mặt phẳng XZ). */
export interface FurnitureBox {
    cx: number;
    cz: number;
    hw: number;
    hd: number;
    rotY: number;
}

export interface AlignInput {
    /** Tâm dự kiến (world, RAW — helper tự lo grid snap). */
    cx: number;
    cz: number;
    /** Half-extent footprint theo trục LOCAL của vật (rộng/2, sâu/2) — mét. */
    hw: number;
    hd: number;
    /** Yaw quanh trục Y (radian, three.js convention). */
    rotY: number;
    /** Danh sách tường để xét wall-snap. Rỗng = chỉ edge-snap lưới. */
    walls: WallSegment[];
    /** Đồ lân cận để xét neighbor-align (mép thẳng hàng). Bỏ trống = không xét. */
    neighbors?: FurnitureBox[];
    /** Override dung sai hút tường (mét). Mặc định WALL_SNAP_TOL_M. */
    tolerance?: number;
    /** Override khe hở mép-tường (mét). Mặc định WALL_SNAP_GAP_M. */
    gap?: number;
}

export interface AlignResult {
    x: number;
    z: number;
    guides: AlignGuide[];
}

const EPS = 1e-6;

/**
 * Half-extent của AABB bao quanh OBB đã xoay (dùng cho edge-snap lưới).
 * Axis-aligned: trả về (hw, hd). Xoay 90°: (hd, hw). Xoay khác: lớn hơn (bao OBB).
 */
function aabbHalfExtents(hw: number, hd: number, rotY: number): { hx: number; hz: number } {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    return { hx: hw * c + hd * s, hz: hw * s + hd * c };
}

/** Snap một trục sao cho mép (center − half) rơi vào lưới SNAP_M. */
function edgeSnapAxis(center: number, half: number): number {
    return snapToGridM(center - half) + half;
}

/**
 * Bước 1 — edge-snap về lưới {@link SNAP_M}.
 * Tách riêng để test + để call site preview dùng được độc lập wall-snap.
 */
export function snapCenterToGrid(cx: number, cz: number, hw: number, hd: number, rotY: number): { x: number; z: number } {
    const { hx, hz } = aabbHalfExtents(hw, hd, rotY);
    return { x: edgeSnapAxis(cx, hx), z: edgeSnapAxis(cz, hz) };
}

/**
 * Bước 2 — wall-snap: hút mép vật áp sát mặt trong gần nhất của một bức tường.
 *
 * Với mỗi tường: dựng pháp tuyến đơn vị, chiếu nửa-kích-thước OBB lên pháp tuyến
 * (reachN) và lên phương dọc tường (reachT) để biết "tầm với" của vật. Nếu vật phủ
 * dọc thân tường và mép cách mặt tường trong dung sai → dịch tâm dọc pháp tuyến cho
 * mép áp sát mặt (chừa `gap`). Chọn tường có hiệu chỉnh nhỏ nhất.
 */
export function resolveWallSnap(
    cx: number,
    cz: number,
    hw: number,
    hd: number,
    rotY: number,
    walls: WallSegment[],
    tolerance: number,
    gap: number,
): AlignResult {
    // Trục local của vật trong world (three.js Y-rotation):
    //   localX → ( cosθ, −sinθ),  localZ → ( sinθ,  cosθ)  trong mặt phẳng (x,z).
    const axX = Math.cos(rotY);
    const axZ = -Math.sin(rotY);
    const azX = Math.sin(rotY);
    const azZ = Math.cos(rotY);

    let best: { correction: number; nx: number; nz: number; guide: AlignGuide } | null = null;

    for (const w of walls) {
        const abx = w.bx - w.ax;
        const abz = w.bz - w.az;
        const len = Math.hypot(abx, abz);
        if (len < EPS) continue;

        const dx = abx / len;
        const dz = abz / len;
        const nx = -dz; // pháp tuyến đơn vị
        const nz = dx;

        // Tầm với của OBB theo pháp tuyến và dọc thân tường.
        const reachN = Math.abs(hw * (axX * nx + axZ * nz)) + Math.abs(hd * (azX * nx + azZ * nz));
        const reachT = Math.abs(hw * (axX * dx + axZ * dz)) + Math.abs(hd * (azX * dx + azZ * dz));

        const rx = cx - w.ax;
        const rz = cz - w.az;
        const distN = rx * nx + rz * nz; // khoảng cách có dấu tâm → tâm tường
        const projT = rx * dx + rz * dz; // toạ độ dọc thân tường

        // Phải phủ dọc thân tường thì mới là "kê cạnh tường này".
        if (projT + reachT < -tolerance) continue;
        if (projT - reachT > len + tolerance) continue;

        // Chỉ xét MẶT CÙNG PHÍA với vật (theo dấu distN) — không hút sang mặt
        // đối diện (sẽ làm vật xuyên qua thân tường). distN≈0 = vật nằm giữa
        // tường (đang chồng nặng) → để collision lo, bỏ qua.
        const s = Math.sign(distN);
        if (s === 0) continue;
        const faceN = (s * w.thickness) / 2;
        const edgeGap = Math.abs(distN - faceN) - reachN; // khe mép-vật → mặt tường
        if (Math.abs(edgeGap) > tolerance) continue;

        // Mép vật áp sát mặt tường, chừa `gap`, nằm phía ngoài (cùng phía vật).
        const desiredDistN = faceN + s * (reachN + gap);
        const correction = desiredDistN - distN;
        if (best === null || Math.abs(correction) < Math.abs(best.correction)) {
            best = {
                correction,
                nx,
                nz,
                guide: {
                    x1: w.ax + faceN * nx,
                    z1: w.az + faceN * nz,
                    x2: w.bx + faceN * nx,
                    z2: w.bz + faceN * nz,
                    kind: "wall",
                },
            };
        }
    }

    if (!best) return { x: cx, z: cz, guides: [] };
    return {
        x: cx + best.correction * best.nx,
        z: cz + best.correction * best.nz,
        guides: [best.guide],
    };
}

/**
 * Bước 3 — neighbor-align: hút mép vật thẳng hàng với mép đồ lân cận (AABB).
 * Axis-aligned (xét OBB qua AABB bao) — đủ cho căn thẳng hàng nhanh; vật xoay dùng
 * AABB bao quanh. Xét độc lập 2 trục X/Z, mỗi trục chọn neighbor gần nhất trong dung sai.
 */
export function resolveNeighborSnap(
    cx: number,
    cz: number,
    hw: number,
    hd: number,
    rotY: number,
    neighbors: FurnitureBox[],
    tolerance: number,
): AlignResult {
    const self = aabbHalfExtents(hw, hd, rotY);
    let x = cx;
    let z = cz;
    const guides: AlignGuide[] = [];

    // Trục X: hút mép X của vật vào mép X neighbor khi 2 hộp phủ nhau theo Z.
    let bestDX = tolerance;
    let tx: number | null = null;
    for (const n of neighbors) {
        const nh = aabbHalfExtents(n.hw, n.hd, n.rotY);
        if (Math.abs(cz - n.cz) >= self.hz + nh.hz) continue;
        for (const target of [n.cx - (nh.hx + self.hx), n.cx + (nh.hx + self.hx)]) {
            const d = Math.abs(cx - target);
            if (d < bestDX) { bestDX = d; tx = target; }
        }
    }
    if (tx !== null) {
        x = tx;
        guides.push({ x1: tx, z1: cz - self.hz, x2: tx, z2: cz + self.hz, kind: "neighbor" });
    }

    // Trục Z: tương tự, phủ nhau theo X (dùng x đã snap).
    let bestDZ = tolerance;
    let tz: number | null = null;
    for (const n of neighbors) {
        const nh = aabbHalfExtents(n.hw, n.hd, n.rotY);
        if (Math.abs(x - n.cx) >= self.hx + nh.hx) continue;
        for (const target of [n.cz - (nh.hz + self.hz), n.cz + (nh.hz + self.hz)]) {
            const d = Math.abs(cz - target);
            if (d < bestDZ) { bestDZ = d; tz = target; }
        }
    }
    if (tz !== null) {
        z = tz;
        guides.push({ x1: x - self.hx, z1: tz, x2: x + self.hx, z2: tz, kind: "neighbor" });
    }

    return { x, z, guides };
}

/**
 * Căn chỉnh đầy đủ: edge-snap lưới → wall-snap → neighbor-align.
 * Đây là hàm các call site (2D drag, 3D gizmo, placement, command handler) nên gọi.
 * Ưu tiên: tường > đồ lân cận (chỉ xét neighbor khi không hút được tường).
 */
export function resolveAlignment(input: AlignInput): AlignResult {
    const tolerance = input.tolerance ?? WALL_SNAP_TOL_M;
    const gap = input.gap ?? WALL_SNAP_GAP_M;
    const neighbors = input.neighbors ?? [];

    const grid = snapCenterToGrid(input.cx, input.cz, input.hw, input.hd, input.rotY);

    const wall = input.walls.length > 0
        ? resolveWallSnap(grid.x, grid.z, input.hw, input.hd, input.rotY, input.walls, tolerance, gap)
        : { x: grid.x, z: grid.z, guides: [] as AlignGuide[] };

    if (wall.guides.length === 0 && neighbors.length > 0) {
        return resolveNeighborSnap(grid.x, grid.z, input.hw, input.hd, input.rotY, neighbors, tolerance);
    }
    return wall;
}
