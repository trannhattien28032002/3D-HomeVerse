/**
 * solver/anchors — giải named anchor → {x,z,rotY} từ hình học phòng.
 *
 * Dựa calibration ở types.ts: forward(rotY)=(sin,cos); north=minZ … east=maxX.
 * "into-room" = mặt quay vào trong phòng (back áp tường).
 */
import type { Anchor, PlacementIntent, Placement, SolverRoom, Footprint } from "src/ai/solver/types";
import { aabbHalfExtents } from "src/ai/solver/rect";

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** rotY để "quay vào phòng" khi áp mỗi tường. */
const INTO_ROOM: Record<string, number> = {
    "north-wall": 0, // mặt +Z
    "south-wall": Math.PI, // mặt −Z
    "west-wall": Math.PI / 2, // mặt +X
    "east-wall": (3 * Math.PI) / 2, // mặt −X
    center: 0,
};

/** Tường + đầu align mà mỗi corner quy về (giữ xoay bội 90°). */
const CORNER: Record<string, { wall: Anchor; align: number }> = {
    "corner-nw": { wall: "north-wall", align: 0 },
    "corner-ne": { wall: "north-wall", align: 1 },
    "corner-sw": { wall: "south-wall", align: 0 },
    "corner-se": { wall: "south-wall", align: 1 },
};

function resolveRotY(anchor: Anchor, facing: PlacementIntent["facing"]): number {
    if (typeof facing === "number") return norm(facing);
    const into = INTO_ROOM[anchor] ?? 0;
    if (facing === "to-wall") return norm(into + Math.PI);
    return into; // "into-room" | undefined
}

/**
 * Toạ độ neo lý tưởng cho 1 món (chưa xét chồng — đó là việc solveLayout).
 * Trả Placement. Nếu phòng quá hẹp so với món, x/z bị kẹp về giữa cạnh
 * (insideRoom sẽ bắt và solveLayout đẩy sang skipped).
 */
export function resolveAnchor(room: SolverRoom, intent: PlacementIntent, fp: Footprint): Placement {
    const { modelId } = intent;
    const anchor = intent.against ?? "center";
    const t = room.wallThickness / 2;
    const { minX, minZ, maxX, maxZ } = room.bbox;
    const align = intent.align ?? 0.5;

    // Corner → quy về tường + align cụ thể.
    if (anchor.startsWith("corner-")) {
        const c = CORNER[anchor];
        return resolveAnchor(room, { ...intent, against: c.wall, align: c.align }, fp);
    }

    if (anchor === "center") {
        const rotY = resolveRotY("center", intent.facing);
        return { modelId, x: room.centroid.x, z: room.centroid.z, rotY };
    }

    const rotY = resolveRotY(anchor, intent.facing);
    const { hx, hz } = aabbHalfExtents(fp.width / 2, fp.depth / 2, rotY);

    if (anchor === "north-wall" || anchor === "south-wall") {
        const z = anchor === "north-wall" ? minZ + t + hz : maxZ - t - hz;
        const lo = minX + t + hx;
        const hi = maxX - t - hx;
        const x = lo <= hi ? lerp(lo, hi, align) : (minX + maxX) / 2;
        return { modelId, x, z, rotY };
    }
    // east/west wall
    const x = anchor === "west-wall" ? minX + t + hx : maxX - t - hx;
    const lo = minZ + t + hz;
    const hi = maxZ - t - hz;
    const z = lo <= hi ? lerp(lo, hi, align) : (minZ + maxZ) / 2;
    return { modelId, x, z, rotY };
}
