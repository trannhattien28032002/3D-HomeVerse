/**
 * solver/rect — AABB thuần (mét, trục XZ).
 *
 * Ngữ nghĩa half-extent xoay PHẢI khớp engine để "solver bảo OK" == "move tay
 * không báo chồng". Đối chiếu: src/shared/geometry/alignment.ts aabbHalfExtents
 * và src/engine/adapters/furnitureBoxes.ts (ColliderAABB lưu nửa-kích thước).
 */
import type { Rect, Footprint, SolverRoom } from "src/ai/solver/types";

/**
 * Nửa-kích thước AABB thế giới của một hộp (nửa hw,hd) xoay rotY.
 * Xoay 0°→(hw,hd); 90°→(hd,hw); góc khác→bao OBB. Trùng công thức engine.
 */
export function aabbHalfExtents(hw: number, hd: number, rotY: number): { hx: number; hz: number } {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    return { hx: hw * c + hd * s, hz: hw * s + hd * c };
}

/** Rect AABB thế giới của 1 món tại (x,z) xoay rotY với footprint full-size. */
export function footprintRect(x: number, z: number, rotY: number, fp: Footprint): Rect {
    const { hx, hz } = aabbHalfExtents(fp.width / 2, fp.depth / 2, rotY);
    return { minX: x - hx, minZ: z - hz, maxX: x + hx, maxZ: z + hz };
}

/** Nới rộng rect ra mọi phía `m` mét (m có thể âm để co). */
export function inflate(r: Rect, m: number): Rect {
    return { minX: r.minX - m, minZ: r.minZ - m, maxX: r.maxX + m, maxZ: r.maxZ + m };
}

/** Hai rect có giao nhau không (chạm mép = KHÔNG chồng). */
export function overlaps(a: Rect, b: Rect): boolean {
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Vùng trong phòng dùng được = bbox co vào nửa bề dày tường. */
export function usableBounds(room: SolverRoom): Rect {
    const t = room.wallThickness / 2;
    return inflate(room.bbox, -t);
}

/**
 * Rect có nằm GỌN trong phòng không.
 * M1: dùng usableBounds (bbox − nửa tường). Phòng lồi/chữ nhật chính xác; phòng
 * lõm chỉ đảm bảo trong bbox (giới hạn có chủ đích, ghi trong plan).
 */
export function insideRoom(r: Rect, room: SolverRoom): boolean {
    const b = usableBounds(room);
    return r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ;
}

/** Diện tích rect (m²). */
export function area(r: Rect): number {
    return Math.max(0, r.maxX - r.minX) * Math.max(0, r.maxZ - r.minZ);
}
