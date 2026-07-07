/**
 * housePlanner — brief → lưới phòng 1 tầng (WP6, thuần).
 *
 * Chia footprint chữ nhật thành các phòng bằng slice-and-dice treemap: luôn cắt
 * theo cạnh DÀI hơn, tỉ lệ theo diện tích → phủ kín, không chồng, không hở, tỉ lệ
 * cạnh hợp lý. M1: 1 tầng, phòng chữ nhật. Adjacency để đặt cửa giữa phòng kề.
 */
import defaultsJson from "src/ai/data/defaults.json";

export type RoomType = "living" | "bedroom" | "kitchen" | "bathroom" | "dining" | "study";
export type StyleId = string;
export type RoomReq = { type: RoomType; count: number; areaM2?: number };
export type HouseBrief = {
    style: StyleId;
    totalAreaM2?: number;
    rooms: RoomReq[];
    footprint?: { width: number; depth: number };
};

/** [x1, z1, x2, z2] */
export type Rect4 = [number, number, number, number];
export type RoomPlan = { type: RoomType; rect: Rect4 };
export type HousePlan = { footprint: { width: number; depth: number }; rooms: RoomPlan[] };

type RoomDefault = { minAreaM2: number; typicalAreaM2: number };
const ROOM_DEFAULTS = (defaultsJson as { rooms: Record<string, RoomDefault> }).rooms;
const ASPECT = 4 / 3; // tỉ lệ width:depth mặc định của footprint

const EPS = 1e-6;

function typicalArea(type: RoomType): number {
    return ROOM_DEFAULTS[type]?.typicalAreaM2 ?? 10;
}

/** Trọng số (≈ diện tích mong muốn) của 1 phòng. */
function weightOf(r: { type: RoomType; areaM2?: number }): number {
    return r.areaM2 ?? typicalArea(r.type);
}

/** Slice-and-dice: tile rect theo items (đã có weight), cắt cạnh dài hơn. */
function tile(rect: Rect4, items: { type: RoomType; weight: number }[]): RoomPlan[] {
    if (items.length === 1) return [{ type: items[0].type, rect }];

    const total = items.reduce((s, it) => s + it.weight, 0);
    // Tách 2 nhóm liên tiếp ~ nửa trọng số (mỗi nhóm ≥ 1 phòng).
    let acc = 0, k = 0;
    for (let i = 0; i < items.length - 1; i++) {
        acc += items[i].weight;
        if (acc >= total / 2) { k = i + 1; break; }
    }
    if (k < 1) k = 1;
    if (k >= items.length) k = items.length - 1;

    const A = items.slice(0, k);
    const B = items.slice(k);
    const frac = A.reduce((s, it) => s + it.weight, 0) / total;

    const [x1, z1, x2, z2] = rect;
    const w = x2 - x1, h = z2 - z1;
    if (w >= h) {
        const xm = x1 + w * frac;
        return [...tile([x1, z1, xm, z2], A), ...tile([xm, z1, x2, z2], B)];
    }
    const zm = z1 + h * frac;
    return [...tile([x1, z1, x2, zm], A), ...tile([x1, zm, x2, z2], B)];
}

export function planHouse(brief: HouseBrief): HousePlan {
    // 1. Bung phòng theo count → items có weight.
    const items: { type: RoomType; weight: number }[] = [];
    for (const r of brief.rooms) {
        for (let i = 0; i < Math.max(1, r.count); i++) items.push({ type: r.type, weight: weightOf(r) });
    }
    if (items.length === 0) throw new Error("Brief không có phòng nào.");

    // Sắp giảm dần trọng số → tỉ lệ cạnh đẹp hơn (phòng lớn cắt trước).
    items.sort((a, b) => b.weight - a.weight);

    // 2. Footprint: brief.footprint, else suy từ tổng diện tích (totalAreaM2 hoặc Σweight).
    const sumW = items.reduce((s, it) => s + it.weight, 0);
    let footprint = brief.footprint;
    if (!footprint) {
        const A = brief.totalAreaM2 ?? sumW;
        const width = Math.sqrt(A * ASPECT);
        footprint = { width, depth: A / width };
    }

    // 3. Tile.
    const rooms = tile([0, 0, footprint.width, footprint.depth], items);
    return { footprint, rooms };
}

// ── Adjacency (để đặt cửa giữa phòng kề) ──────────────────────────────────────

export type Adjacency = {
    a: number; // index phòng A
    b: number; // index phòng B
    axis: "x" | "z"; // cạnh chung vuông góc trục này (x = cạnh dọc, z = cạnh ngang)
    line: number; // toạ độ cạnh chung
    span: [number, number]; // đoạn chồng lấn dọc cạnh
};

function overlap(a1: number, a2: number, b1: number, b2: number): [number, number] | null {
    const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
    return hi - lo > 0.5 ? [lo, hi] : null; // cần ≥0.5m mới đủ đặt cửa
}

/** Các cặp phòng dùng chung 1 cạnh đủ dài để mở cửa. */
export function computeAdjacencies(rooms: RoomPlan[]): Adjacency[] {
    const out: Adjacency[] = [];
    for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
            const [ax1, az1, ax2, az2] = rooms[i].rect;
            const [bx1, bz1, bx2, bz2] = rooms[j].rect;
            // Cạnh dọc chung (x = const): a.x2 == b.x1 hoặc b.x2 == a.x1.
            if (Math.abs(ax2 - bx1) < EPS || Math.abs(bx2 - ax1) < EPS) {
                const sp = overlap(az1, az2, bz1, bz2);
                if (sp) out.push({ a: i, b: j, axis: "x", line: Math.abs(ax2 - bx1) < EPS ? ax2 : ax1, span: sp });
            }
            // Cạnh ngang chung (z = const).
            if (Math.abs(az2 - bz1) < EPS || Math.abs(bz2 - az1) < EPS) {
                const sp = overlap(ax1, ax2, bx1, bx2);
                if (sp) out.push({ a: i, b: j, axis: "z", line: Math.abs(az2 - bz1) < EPS ? az2 : az1, span: sp });
            }
        }
    }
    return out;
}
