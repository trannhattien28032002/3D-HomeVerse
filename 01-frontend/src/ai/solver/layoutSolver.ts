/**
 * solver/layoutSolver — tính toạ độ đặt đồ (WP4).
 *
 * AI quyết Ý ĐỊNH (PlacementIntent); code DUY NHẤT đảm bảo không-chồng / trong
 * phòng / chừa lối đi. ⚠️ PLACE_FURNITURE không check va chạm ở engine → đây là
 * lưới an toàn duy nhất (AI-AGENT-BUILD-PLAN Sai khác #7).
 *
 * M1: chỉ xoay bội 90° (anchor cho rotY ∈ {0,π/2,π,3π/2}) → AABB chính xác.
 */
import type {
    SolverRoom, PlacementIntent, Placement, LayoutResult, Obstacle, FootprintGetter, Rect, Footprint,
} from "src/ai/solver/types";
import { resolveAnchor } from "src/ai/solver/anchors";
import { aabbHalfExtents, footprintRect, inflate, overlaps, insideRoom, usableBounds } from "src/ai/solver/rect";

const DEFAULT_CLEARANCE = 0.6;
const SLIDE_STEP = 0.1; // bước trượt dọc tường (m)
const GRID_STEP = 0.25; // bước quét lưới fallback (m) — mặc định cho phòng thường
const REL_GAPS = [0.02, 0.15, 0.3]; // khe thử khi neo tương đối (m)

// Trần số ô lưới mỗi cạnh trước khi GRID_STEP tự nới rộng — chặn quét lưới không
// giới hạn với phòng lớn (VD: generateHouse sinh nhiều phòng lớn cho món center/
// không-neo). Phòng thường (≤10m mỗi cạnh ở GRID_STEP mặc định) không bị ảnh hưởng.
const MAX_GRID_CELLS_PER_AXIS = 40;

/** GRID_STEP thích ứng theo usableBounds: giữ nguyên mặc định cho phòng thường, chỉ nới rộng khi phòng đủ lớn để vượt trần ô lưới. (export: test trực tiếp) */
export function adaptiveGridStep(b: Rect): number {
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    return Math.max(GRID_STEP, span / MAX_GRID_CELLS_PER_AXIS);
}

/** Offset (dc,dr) của viền hình vuông bán kính `radius` quanh tâm — dùng để duyệt lưới theo spiral mà không quét lại ô đã thăm. */
function* ringOffsets(radius: number): Generator<[number, number]> {
    if (radius === 0) { yield [0, 0]; return; }
    for (let dc = -radius; dc <= radius; dc++) {
        yield [dc, -radius];
        yield [dc, radius];
    }
    for (let dr = -radius + 1; dr <= radius - 1; dr++) {
        yield [-radius, dr];
        yield [radius, dr];
    }
}

/**
 * Quét lưới usableBounds theo thứ tự SPIRAL từ ô gần `seed` nhất (thay vì raster
 * từ góc phòng) — hội tụ nhanh vì vị trí lý tưởng gần đó thường đã hợp lệ (case
 * phổ biến), consumer (solveLayout) dừng ngay khi tìm được ứng viên hợp lệ đầu
 * tiên. Vẫn phủ đúng tập ô như raster cũ ở fallback (case xấu) — chỉ đổi thứ tự.
 * (export: test trực tiếp)
 */
export function* spiralGridCandidates(b: Rect, seed: { x: number; z: number }, step: number): Generator<{ x: number; z: number }> {
    const nx = Math.floor((b.maxX - b.minX) / step);
    const nz = Math.floor((b.maxZ - b.minZ) / step);
    const c0 = Math.min(nx, Math.max(0, Math.round((seed.x - b.minX) / step)));
    const r0 = Math.min(nz, Math.max(0, Math.round((seed.z - b.minZ) / step)));
    const maxRadius = Math.max(c0, nx - c0, r0, nz - r0);

    for (let radius = 0; radius <= maxRadius; radius++) {
        for (const [dc, dr] of ringOffsets(radius)) {
            const c = c0 + dc;
            const r = r0 + dr;
            if (c < 0 || c > nx || r < 0 || r > nz) continue;
            yield { x: b.minX + c * step, z: b.minZ + r * step };
        }
    }
}

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** "Đã chiếm" của một placement đã đặt — để neo tương đối bám MÉP NGOÀI occupancy. */
type Placed = { p: Placement; occ: Rect };

/** 1 món: toạ độ neo lý tưởng (không xét chồng). */
export function solvePlacement(
    room: SolverRoom,
    intent: PlacementIntent,
    getFootprint: FootprintGetter,
): Placement {
    return resolveAnchor(room, intent, getFootprint(intent.modelId));
}

/** Rect "đã chiếm" của 1 placement = footprint nới nửa clearance (để cộng 2 nửa = đủ lối đi). */
function occupancyRect(p: Placement, fp: { width: number; depth: number }, clearance: number): Rect {
    return inflate(footprintRect(p.x, p.z, p.rotY, fp), clearance / 2);
}

/**
 * Một placement có hợp lệ (gọn trong phòng + không chồng obstacle CÙNG LỚP). Thảm
 * (underlay) nằm dưới đồ → bỏ va chạm với furniture/cửa, chỉ kỵ thảm khác; ngược lại
 * đồ thường bỏ va chạm với thảm.
 */
function isValid(p: Placement, fp: Footprint, clearance: number, room: SolverRoom, obstacles: Obstacle[], isUnderlay: boolean): boolean {
    const foot = footprintRect(p.x, p.z, p.rotY, fp);
    if (!insideRoom(foot, room)) return false;
    const occ = occupancyRect(p, fp, clearance);
    return !obstacles.some((o) => {
        const crossLayer = isUnderlay ? o.kind !== "underlay" : o.kind === "underlay";
        if (crossLayer) return false; // khác lớp → bỏ qua va chạm
        return overlaps(occ, o.rect);
    });
}

/**
 * Ứng viên cho món NEO TƯƠNG ĐỐI (B1/B2): bám MÉP NGOÀI occupancy của ref.
 *  - "front": 1 hướng = mặt ref đang quay (sofa→bàn trà trước mặt). Món quay lại nhìn ref.
 *  - "around": 4 cạnh ref, bắt đầu từ `aroundIdx` (ghế quanh bàn — mỗi ghế 1 cạnh).
 * Vị trí = mép occupancy ref + (khe + nửa-kích-món) dọc hướng. rotY bội 90° → AABB chuẩn.
 */
function* relativeCandidates(intent: PlacementIntent, itFp: Footprint, ref: Placed, aroundIdx: number): Generator<Placement> {
    const { p: R, occ } = ref;
    // 4 cạnh: nam(+Z), bắc(−Z), đông(+X), tây(−X).
    const SIDES = [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }];
    const dirs = intent.relation === "around"
        ? [0, 1, 2, 3].map((k) => SIDES[(aroundIdx + k) % 4])
        : [{ dx: Math.round(Math.sin(R.rotY)), dz: Math.round(Math.cos(R.rotY)) }]; // "front" = mặt ref
    for (const d of dirs) {
        if (d.dx === 0 && d.dz === 0) continue;
        const rotY = norm(Math.atan2(-d.dx, -d.dz)); // quay MẶT về phía ref
        const { hx, hz } = aabbHalfExtents(itFp.width / 2, itFp.depth / 2, rotY);
        const half = Math.abs(d.dx) * hx + Math.abs(d.dz) * hz;
        const edgeX = d.dx > 0 ? occ.maxX : d.dx < 0 ? occ.minX : R.x;
        const edgeZ = d.dz > 0 ? occ.maxZ : d.dz < 0 ? occ.minZ : R.z;
        for (const gap of REL_GAPS) {
            yield {
                modelId: intent.modelId,
                x: edgeX + d.dx * (gap + half),
                z: edgeZ + d.dz * (gap + half),
                rotY,
            };
        }
    }
}

/**
 * Sinh các vị trí ứng viên: neo lý tưởng → trượt dọc tường → (chỉ center/no-anchor) quét lưới.
 *
 * B4: món áp tường/góc KHÔNG còn quét lưới toàn phòng — nếu kẹt thì trượt dọc tường rồi
 * thôi (skip). Trước đây grid-scan làm món đáng-lẽ-áp-tường "trôi" ra giữa phòng (nhìn như
 * rải ngẫu nhiên). Chỉ center / không-neo mới được quét lưới (chúng vốn không có "đúng chỗ").
 */
function* candidates(room: SolverRoom, intent: PlacementIntent, fp: { width: number; depth: number }): Generator<Placement> {
    const ideal = resolveAnchor(room, intent, fp);
    yield ideal;

    const anchor = intent.against;
    const isWall = anchor === "north-wall" || anchor === "south-wall" || anchor === "east-wall" || anchor === "west-wall";
    const isCorner = typeof anchor === "string" && anchor.startsWith("corner-");
    if (isWall) {
        // Trượt dọc tường: đổi align theo bước ~SLIDE_STEP mét.
        const b = usableBounds(room);
        const span = (anchor === "north-wall" || anchor === "south-wall") ? b.maxX - b.minX : b.maxZ - b.minZ;
        const steps = Math.max(1, Math.floor(span / SLIDE_STEP));
        for (let k = 0; k <= steps; k++) {
            const align = k / steps;
            yield resolveAnchor(room, { ...intent, align }, fp);
        }
    }

    // Quét lưới CHỈ cho center / không-neo (không "trôi" vì chúng không có chỗ cố định).
    // Món áp tường/góc bỏ qua → kẹt thì skip, không văng giữa phòng.
    if (isWall || isCorner) return;
    const b = usableBounds(room);
    const rotY = ideal.rotY;
    const step = adaptiveGridStep(b);
    for (const { x, z } of spiralGridCandidates(b, ideal, step)) {
        yield { modelId: intent.modelId, x, z, rotY };
    }
}

/**
 * Nhiều món (greedy): món "neo cứng" (áp tường) đặt trước, phụ kiện sau. Mỗi món
 * thử neo lý tưởng → trượt/quét tìm chỗ hợp lệ đầu tiên; không có → skipped (KHÔNG
 * đặt liều). Trả placed[] (cho PLACE_FURNITURE) + skipped[] (cho agent).
 */
export function solveLayout(
    room: SolverRoom,
    intents: PlacementIntent[],
    opts: { getFootprint: FootprintGetter; existing?: Obstacle[] },
): LayoutResult {
    const { getFootprint } = opts;
    const obstacles: Obstacle[] = [...(opts.existing ?? [])];
    const placed: Placement[] = [];
    const skipped: { modelId: string; reason: string }[] = [];
    /** modelId → placement đầu tiên đã đặt (để neo tương đối tham chiếu). */
    const placedByModel = new Map<string, Placed>();
    /** modelId ref → số món "around" đã xử (để xoay vòng 4 cạnh). */
    const aroundCount = new Map<string, number>();

    // 2 PHA: (1) món neo TUYỆT ĐỐI (áp tường/góc/center) xếp trước theo priority — ổn định
    // và để ref tồn tại; (2) món neo TƯƠNG ĐỐI (anchorTo) sau, theo thứ tự nhập.
    const indexed = intents.map((it, i) => ({ it, i }));
    const base = indexed.filter((x) => !x.it.anchorTo).sort((a, b) => priority(b.it) - priority(a.it) || a.i - b.i);
    const rel = indexed.filter((x) => x.it.anchorTo);
    const ordered = [...base, ...rel].map((x) => x.it);

    for (const intent of ordered) {
        const fp = getFootprint(intent.modelId);
        const clearance = intent.clearance ?? DEFAULT_CLEARANCE;
        const isUnderlay = intent.layer === "underlay";

        let cands: Iterable<Placement>;
        if (intent.anchorTo) {
            const ref = placedByModel.get(intent.anchorTo);
            if (!ref) { skipped.push({ modelId: intent.modelId, reason: `ref "${intent.anchorTo}" chưa đặt được` }); continue; }
            const idx = aroundCount.get(intent.anchorTo) ?? 0;
            if (intent.relation === "around") aroundCount.set(intent.anchorTo, idx + 1);
            cands = relativeCandidates(intent, fp, ref, idx);
        } else {
            cands = candidates(room, intent, fp);
        }

        let chosen: Placement | null = null;
        for (const cand of cands) {
            if (isValid(cand, fp, clearance, room, obstacles, isUnderlay)) { chosen = cand; break; }
        }
        if (!chosen) {
            skipped.push({ modelId: intent.modelId, reason: "hết chỗ tránh chồng/lối đi trong phòng" });
            continue;
        }
        if (isUnderlay) chosen = { ...chosen, layer: "underlay" };
        placed.push(chosen);
        const occ = occupancyRect(chosen, fp, clearance);
        if (!placedByModel.has(intent.modelId)) placedByModel.set(intent.modelId, { p: chosen, occ });
        obstacles.push({ rect: occ, kind: isUnderlay ? "underlay" : "furniture" });
    }

    return { placed, skipped };
}

function priority(it: PlacementIntent): number {
    const a = it.against;
    if (a && a.endsWith("-wall")) return 2;
    if (a && a.startsWith("corner-")) return 1;
    return 0; // center / không neo
}
