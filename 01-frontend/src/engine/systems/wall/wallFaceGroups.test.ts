/**
 * wallFaceGroups.test — phân loại 2 mặt tường (left/right) qua half-space.
 *
 * Kiểm 3 ca: (a) tường thẳng (ExtrudeGeometry thuần), (b) tường khoét cửa (CSG xáo
 * triangle), (c) tường mép nghiêng kiểu miter. Mọi ca: groups phủ kín, left/right
 * gom đúng phía, reveal/đầu/nóc/đáy rơi "other".
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { Point2D } from "src/engine/components/wall/WallPolygon";
import {
    wallLeftNormal,
    classifyWallFaceGroups,
    WALL_FACE_LEFT,
    WALL_FACE_RIGHT,
    WALL_FACE_OTHER,
} from "src/engine/systems/wall/wallFaceGroups";
import { buildExtrudeGeo } from "src/engine/systems/wall/wallMeshBuilder";
import { buildCutWallGeo } from "src/engine/systems/wall/wallOpeningCutter";
import type { MountWall } from "src/shared/geometry/wallMount";

/** Polygon footprint [startLeft, endLeft, endRight, startRight] cho tường a→b dày `th`. */
function makeWallPoly(ax: number, az: number, bx: number, bz: number, th: number): Point2D[] {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const lx = -uz, lz = ux; // trái
    const h = th / 2;
    return [
        { x: ax + lx * h, z: az + lz * h }, // startLeft
        { x: bx + lx * h, z: bz + lz * h }, // endLeft
        { x: bx - lx * h, z: bz - lz * h }, // endRight
        { x: ax - lx * h, z: az - lz * h }, // startRight
    ];
}

/** Đếm số tam giác mỗi materialIndex từ groups (đã coalesce → chia 3). */
function countByIndex(geo: THREE.BufferGeometry): Record<number, number> {
    const out: Record<number, number> = {};
    for (const g of geo.groups) {
        out[g.materialIndex!] = (out[g.materialIndex!] ?? 0) + g.count / 3;
    }
    return out;
}

/** Tổng tam giác trong geometry. */
function triTotal(geo: THREE.BufferGeometry): number {
    const idx = geo.getIndex();
    const pos = geo.getAttribute("position");
    return idx ? idx.count / 3 : pos.count / 3;
}

/** Centroid + offset half-space của 1 tam giác để verify độc lập với classifier. */
function triOffset(geo: THREE.BufferGeometry, tri: number, poly: Point2D[]): { offset: number; ny: number } {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const idx = geo.getIndex();
    const vi = (c: number) => (idx ? idx.getX(tri * 3 + c) : tri * 3 + c);
    const a = vi(0), b = vi(1), c = vi(2);
    const left = wallLeftNormal(poly)!;
    const cx = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
    const cz = (poly[0].z + poly[1].z + poly[2].z + poly[3].z) / 4;
    const gx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const gz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const e1 = new THREE.Vector3(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
    const e2 = new THREE.Vector3(pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a));
    const n = e1.cross(e2);
    return { offset: (gx - cx) * left.x + (gz - cz) * left.z, ny: n.lengthSq() > 0 ? n.y / n.length() : 0 };
}

/** Map: với mỗi tam giác (theo thứ tự), materialIndex mà groups gán cho nó. */
function triMaterials(geo: THREE.BufferGeometry): number[] {
    const total = triTotal(geo);
    const out = new Array<number>(total).fill(-1);
    for (const g of geo.groups) {
        for (let i = 0; i < g.count / 3; i++) out[g.start / 3 + i] = g.materialIndex!;
    }
    return out;
}

describe("wallLeftNormal", () => {
    it("tường dọc +X → pháp tuyến trái là +Z (về phía startLeft)", () => {
        const poly = makeWallPoly(0, 0, 2, 0, 0.2);
        const n = wallLeftNormal(poly)!;
        // startLeft poly[0] có z>0 → leftNormal hướng +Z.
        expect(n.x).toBeCloseTo(0, 5);
        expect(n.z).toBeCloseTo(1, 5);
    });

    it("tường suy biến (start ≡ end) → null", () => {
        // 4 điểm hữu hạn nhưng start-mid ≡ end-mid (tường dài 0).
        const degenerate: Point2D[] = [
            { x: 0, z: 0.1 }, { x: 0, z: 0.1 }, { x: 0, z: -0.1 }, { x: 0, z: -0.1 },
        ];
        expect(wallLeftNormal(degenerate)).toBeNull();
    });
});

describe("classifyWallFaceGroups — tường thẳng", () => {
    const poly = makeWallPoly(0, 0, 2, 0, 0.2);
    const geo = buildExtrudeGeo(poly, 2.5, 1.25);
    classifyWallFaceGroups(geo, poly);

    it("groups phủ kín toàn bộ tam giác", () => {
        const counts = countByIndex(geo);
        const sum = (counts[0] ?? 0) + (counts[1] ?? 0) + (counts[2] ?? 0);
        expect(sum).toBe(triTotal(geo));
    });

    it("có cả mặt trái, mặt phải, và other (đầu/nóc/đáy)", () => {
        const counts = countByIndex(geo);
        expect(counts[WALL_FACE_LEFT]).toBeGreaterThan(0);
        expect(counts[WALL_FACE_RIGHT]).toBeGreaterThan(0);
        expect(counts[WALL_FACE_OTHER]).toBeGreaterThan(0);
    });

    it("mặt trái ≈ mặt phải (tường đối xứng)", () => {
        const counts = countByIndex(geo);
        expect(counts[WALL_FACE_LEFT]).toBe(counts[WALL_FACE_RIGHT]);
    });

    it("mỗi tam giác được gán đúng phía half-space của nó", () => {
        const mats = triMaterials(geo);
        for (let t = 0; t < mats.length; t++) {
            const { offset, ny } = triOffset(geo, t, poly);
            const th = 0.2, eps = th * 0.25;
            if (Math.abs(ny) > 0.5) expect(mats[t]).toBe(WALL_FACE_OTHER);
            else if (offset > eps) expect(mats[t]).toBe(WALL_FACE_LEFT);
            else if (offset < -eps) expect(mats[t]).toBe(WALL_FACE_RIGHT);
            else expect(mats[t]).toBe(WALL_FACE_OTHER);
        }
    });
});

describe("classifyWallFaceGroups — tường khoét cửa (CSG)", () => {
    const poly = makeWallPoly(0, 0, 3, 0, 0.2);
    const wall: MountWall = { wallId: "w1", ax: 0, az: 0, bx: 3, bz: 0, thickness: 0.2 };
    const geo = buildCutWallGeo(poly, 2.5, wall, [{ t: 0.5, width: 0.9, height: 2.1, sill: 0 }]);

    it("groups phủ kín dù CSG xáo triangle", () => {
        const counts = countByIndex(geo);
        const sum = (counts[0] ?? 0) + (counts[1] ?? 0) + (counts[2] ?? 0);
        expect(sum).toBe(triTotal(geo));
    });

    it("vẫn tách được mặt trái & phải; reveal lỗ rơi other", () => {
        const counts = countByIndex(geo);
        expect(counts[WALL_FACE_LEFT]).toBeGreaterThan(0);
        expect(counts[WALL_FACE_RIGHT]).toBeGreaterThan(0);
        expect(counts[WALL_FACE_OTHER]).toBeGreaterThan(0); // nóc/đáy/đầu + reveal lỗ
    });

    it("không tam giác mặt lớn nào bị gán nhầm phía", () => {
        const mats = triMaterials(geo);
        for (let t = 0; t < mats.length; t++) {
            const { offset, ny } = triOffset(geo, t, poly);
            const eps = 0.2 * 0.25;
            if (Math.abs(ny) <= 0.5 && offset > eps) expect(mats[t]).toBe(WALL_FACE_LEFT);
            if (Math.abs(ny) <= 0.5 && offset < -eps) expect(mats[t]).toBe(WALL_FACE_RIGHT);
        }
    });
});

describe("classifyWallFaceGroups — mép nghiêng kiểu miter", () => {
    // Đầu end bị "xén" lệch: endLeft/endRight đẩy theo phương chéo → mặt dài không
    // song song tim, nhưng offset half-space vẫn giữ đúng dấu.
    const poly: Point2D[] = [
        { x: 0, z: 0.1 },    // startLeft
        { x: 2.0, z: 0.25 }, // endLeft (đẩy ra xa hơn)
        { x: 2.0, z: -0.25 },// endRight
        { x: 0, z: -0.1 },   // startRight
    ];
    const geo = buildExtrudeGeo(poly, 2.5, 1.25);
    classifyWallFaceGroups(geo, poly);

    it("vẫn có cả 2 mặt và mỗi tam giác đúng dấu offset", () => {
        const counts = countByIndex(geo);
        expect(counts[WALL_FACE_LEFT]).toBeGreaterThan(0);
        expect(counts[WALL_FACE_RIGHT]).toBeGreaterThan(0);
        const mats = triMaterials(geo);
        const eps = Math.hypot(poly[0].x - poly[3].x, poly[0].z - poly[3].z) * 0.25;
        for (let t = 0; t < mats.length; t++) {
            const { offset, ny } = triOffset(geo, t, poly);
            if (Math.abs(ny) <= 0.5 && offset > eps) expect(mats[t]).toBe(WALL_FACE_LEFT);
            if (Math.abs(ny) <= 0.5 && offset < -eps) expect(mats[t]).toBe(WALL_FACE_RIGHT);
        }
    });
});
