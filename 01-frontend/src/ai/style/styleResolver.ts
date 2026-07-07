/**
 * styleResolver — style + role → material/model THẬT (WP5, tất định).
 *
 * Material: ưu tiên exemplar palette (đã verify thoả target); phòng ướt dùng
 * override bathFloor/bathWall/kitchenFloor. materialsMatchingTarget lọc theo 2 trục
 * (lightness+temperature) cho variety/override ("tông sáng hơn").
 * Object: chấm điểm theo style[] (khớp / wildcard []) + preferTraits − avoidTraits;
 * fallback bất kỳ trong category. CHỈ trả id có thật trong catalog (tag = catalog).
 */
import stylePacksJson from "src/ai/data/style-packs.json";
import materialTagsJson from "src/ai/data/material-tags.json";
import objectTagsJson from "src/ai/data/object-tags.json";
import type { StylePack, MaterialTag, ObjectTag, RoomType, Surface } from "src/ai/style/types";

const PACKS = (stylePacksJson as { packs: Record<string, StylePack> }).packs;
const MAT = (materialTagsJson as { tags: Record<string, MaterialTag> }).tags;
const OBJ = (objectTagsJson as { tags: Record<string, ObjectTag> }).tags;

export type StyleId = string;

export function listStyleIds(): string[] {
    return Object.keys(PACKS).sort();
}

export function getStylePack(style: StyleId): StylePack {
    const p = PACKS[style];
    if (!p) throw new Error(`Style không tồn tại: "${style}". Có: ${listStyleIds().join(", ")}.`);
    return p;
}

// ── Material ─────────────────────────────────────────────────────────────────

const WET_BY_ROOM: Record<string, "bath" | "kitchen" | undefined> = {
    bathroom: "bath",
    kitchen: "kitchen",
};

/** Material sàn cho style+phòng (override phòng ướt; mặc định exemplar palette). */
export function pickFloorMaterial(style: StyleId, roomType?: RoomType): string {
    const p = getStylePack(style);
    const wet = roomType ? WET_BY_ROOM[roomType] : undefined;
    if (wet === "bath" && p.palette.bathFloor) return p.palette.bathFloor;
    if (wet === "kitchen" && p.palette.kitchenFloor) return p.palette.kitchenFloor;
    return p.palette.floor[0];
}

/** Material tường cho style+phòng. */
export function pickWallMaterial(style: StyleId, roomType?: RoomType): string {
    const p = getStylePack(style);
    const wet = roomType ? WET_BY_ROOM[roomType] : undefined;
    if (wet === "bath" && p.palette.bathWall) return p.palette.bathWall;
    return p.palette.wall[0];
}

/** Material nội thất hợp tone style (lọc 2 trục, loại avoid) — cho variety/override. */
export function materialsMatchingTarget(style: StyleId, surface: Surface): string[] {
    const p = getStylePack(style);
    const tgt = surface === "floor" ? p.floorTarget : p.wallTarget;
    const out: string[] = [];
    for (const [id, m] of Object.entries(MAT)) {
        if (!m.interior) continue;
        if (tgt.lightness.length && !tgt.lightness.includes(m.lightness)) continue;
        if (tgt.temperature.length && !tgt.temperature.includes(m.temperature)) continue;
        if (p.avoid.lightness.includes(m.lightness)) continue;
        if (p.avoid.temperature.includes(m.temperature)) continue;
        out.push(id);
    }
    return out;
}

// ── Object ───────────────────────────────────────────────────────────────────

/** Chấm điểm 1 object cho style. style khớp +2, wildcard [] +1; traits ±. */
function scoreObject(id: string, style: StyleId, prefer: string[], avoid: string[]): number {
    const o = OBJ[id];
    if (!o) return -Infinity;
    let s = 0;
    if (o.style.includes(style)) s += 2;
    else if (o.style.length === 0) s += 1; // wildcard: hợp mọi style
    for (const t of o.traits) {
        if (prefer.includes(t)) s += 1;
        if (avoid.includes(t)) s -= 2;
    }
    return s;
}

/**
 * Chọn model tốt nhất cho 1 role. opts.filter = danh sách id ràng buộc (vd
 * ["plant-a","plant-b"]); nếu không có thì lấy mọi object cùng category.
 * Trả null nếu không có ứng viên.
 */
export function pickModelForRole(
    style: StyleId,
    category: string | undefined,
    opts?: { filter?: string[] },
): string | null {
    const p = getStylePack(style);
    let candidates: string[];
    if (opts?.filter?.length) {
        candidates = opts.filter.filter((id) => id in OBJ);
    } else if (category) {
        candidates = Object.keys(OBJ).filter((id) => OBJ[id].category === category);
    } else {
        return null;
    }
    if (candidates.length === 0) return null;

    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of candidates) {
        const sc = scoreObject(id, style, p.preferTraits, p.avoidTraits);
        if (sc > bestScore) { bestScore = sc; best = id; }
    }
    return best;
}
