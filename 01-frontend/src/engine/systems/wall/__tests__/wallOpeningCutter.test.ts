/**
 * wallOpeningCutter.test — buildCutWallGeo là hàm pure (nhận polygon + openings,
 * trả BufferGeometry) dùng three-bvh-csg thật để khoét lỗ cửa/cửa sổ trên tường.
 * Test sanity: không lỗ → geometry = extrude thường; có lỗ → geometry bị khoét
 * (nhiều tam giác hơn, bounding box tổng thể KHÔNG đổi vì lỗ nằm giữa thân tường).
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";

import { buildCutWallGeo, createWallEvaluator, type OpeningCut } from "src/engine/systems/wall/wallOpeningCutter";
import { buildExtrudeGeo } from "src/engine/systems/wall/wallMeshBuilder";
import type { Point2D } from "src/engine/components/wall/WallPolygon";
import type { MountWall } from "src/shared/geometry/wallMount";

// Tường thẳng dọc trục X, dài 4m, dày 0.2m — polygon world-space [startLeft,endLeft,endRight,startRight].
const POLY: Point2D[] = [
    { x: 0, z: 0.1 },
    { x: 4, z: 0.1 },
    { x: 4, z: -0.1 },
    { x: 0, z: -0.1 },
];
const HEIGHT = 2.4;
const WALL: MountWall = { wallId: "w1", ax: 0, az: 0, bx: 4, bz: 0, thickness: 0.2 };

function triCount(geo: THREE.BufferGeometry): number {
    const idx = geo.index;
    const count = idx ? idx.count : geo.attributes.position.count;
    return count / 3;
}

function bbox(geo: THREE.BufferGeometry): THREE.Box3 {
    geo.computeBoundingBox();
    return geo.boundingBox!.clone();
}

describe("buildCutWallGeo", () => {
    it("không có opening nào → geometry giống hệt buildExtrudeGeo thường (không CSG)", () => {
        const cut = buildCutWallGeo(POLY, HEIGHT, WALL, []);
        const plain = buildExtrudeGeo(POLY, HEIGHT, HEIGHT / 2);

        expect(cut.attributes.position.count).toBe(plain.attributes.position.count);

        const bCut = bbox(cut);
        const bPlain = bbox(plain);
        expect(bCut.min.toArray()).toEqual(bPlain.min.toArray());
        expect(bCut.max.toArray()).toEqual(bPlain.max.toArray());
    });

    it("1 lỗ cửa giữa thân tường → geometry bị khoét (nhiều tam giác hơn), bbox tổng thể không đổi", () => {
        const openings: OpeningCut[] = [{ t: 0.5, width: 0.9, height: 2.1, sill: 0 }];
        const cut = buildCutWallGeo(POLY, HEIGHT, WALL, openings);
        const plain = buildExtrudeGeo(POLY, HEIGHT, HEIGHT / 2);

        expect(cut.attributes.position.count).toBeGreaterThan(0);
        // Khoét lỗ tạo thêm mặt (surround lỗ) → nhiều tam giác hơn bản đặc.
        expect(triCount(cut)).toBeGreaterThan(triCount(plain));

        // Lỗ nằm hoàn toàn giữa thân tường (t=0.5, width 0.9 << length 4) → bounding box
        // tổng thể của tường KHÔNG đổi (CSG chỉ khoét bên trong, không cắt biên ngoài).
        const bCut = bbox(cut);
        const bPlain = bbox(plain);
        expect(bCut.min.x).toBeCloseTo(bPlain.min.x, 3);
        expect(bCut.max.x).toBeCloseTo(bPlain.max.x, 3);
        expect(bCut.min.y).toBeCloseTo(bPlain.min.y, 3);
        expect(bCut.max.y).toBeCloseTo(bPlain.max.y, 3);
    });

    it("2 lỗ (cửa + cửa sổ) không chồng nhau → cả 2 đều được khoét, geometry hợp lệ (không NaN)", () => {
        const openings: OpeningCut[] = [
            { t: 0.2, width: 0.9, height: 2.1, sill: 0 },   // cửa, sát sàn
            { t: 0.7, width: 1.2, height: 1.0, sill: 1.0 }, // cửa sổ, cao hơn
        ];
        const cut = buildCutWallGeo(POLY, HEIGHT, WALL, openings);

        expect(cut.attributes.position.count).toBeGreaterThan(0);
        const pos = cut.attributes.position.array;
        for (let i = 0; i < pos.length; i++) {
            expect(Number.isFinite(pos[i])).toBe(true);
        }
    });

    it("dùng chung 1 Evaluator (caller-owned) cho nhiều lần gọi vẫn ra kết quả đúng", () => {
        const evaluator = createWallEvaluator();
        const openings: OpeningCut[] = [{ t: 0.5, width: 0.9, height: 2.1, sill: 0 }];

        const first = buildCutWallGeo(POLY, HEIGHT, WALL, openings, evaluator);
        const second = buildCutWallGeo(POLY, HEIGHT, WALL, openings, evaluator);

        expect(first.attributes.position.count).toBeGreaterThan(0);
        expect(second.attributes.position.count).toBe(first.attributes.position.count);
    });
});
