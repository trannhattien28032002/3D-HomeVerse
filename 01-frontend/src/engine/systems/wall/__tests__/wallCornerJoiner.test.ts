/**
 * wallCornerJoiner.test — computeMiters là hàm pure (không ECS/THREE) tính điểm nối
 * góc (miter/bevel) tại một node. Test trực tiếp thay vì dựng cả WallGeometrySystem.
 */
import { describe, it, expect } from "vitest";
import { computeMiters, type WallAtNode } from "src/engine/systems/wall/wallCornerJoiner";

/** WallAtNode hướng ra khỏi node theo (nx,nz), thickness đầy đủ (không phải half). */
function wallAt(nx: number, nz: number, thickness: number): WallAtNode {
    return {
        entity: `${nx},${nz}`,
        nx, nz,
        thickness,
        angle: Math.atan2(nz, nx),
        leftNx: -nz, leftNz: nx,
        rightNx: nz, rightNz: -nx,
    };
}

function assertFinitePoint(p: { x: number; z: number }): void {
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
}

describe("computeMiters", () => {
    it("1 tường duy nhất tại node → left/right offset đúng nửa-thickness, không capPolygon", () => {
        const w = wallAt(1, 0, 0.2); // hướng ra +X, thickness 0.2 → half 0.1
        const { miterPoints, capPolygon } = computeMiters({ x: 5, z: 5 }, [w]);

        const m = miterPoints.get(w.entity)!;
        // leftN = (-nz, nx) = (0, 1); rightN = (nz, -nx) = (0, -1)
        expect(m.leftPoint).toEqual({ x: 5, z: 5.1 });
        expect(m.rightPoint).toEqual({ x: 5, z: 4.9 });
        expect(capPolygon).toEqual([]);
    });

    it("2 tường thẳng hàng (180°) → chia sẻ CÙNG một điểm nối, không capPolygon (< 3 điểm)", () => {
        const w1 = wallAt(1, 0, 0.2);  // ra +X
        const w2 = wallAt(-1, 0, 0.2); // ra -X (đối diện — thẳng hàng)
        const { miterPoints, capPolygon } = computeMiters({ x: 0, z: 0 }, [w1, w2]);

        const m1 = miterPoints.get(w1.entity)!;
        const m2 = miterPoints.get(w2.entity)!;
        assertFinitePoint(m1.leftPoint);
        assertFinitePoint(m1.rightPoint);
        assertFinitePoint(m2.leftPoint);
        assertFinitePoint(m2.rightPoint);

        // Nhánh "gần như thẳng hàng": w1.leftPoint === w2.rightPoint (điểm nối chung 1 bên).
        expect(m1.leftPoint).toEqual(m2.rightPoint);
        // Cả 2 lượt xử lý cặp (thuận + đảo chiều) đều rơi vào nhánh thẳng hàng → chỉ 2 điểm
        // được push vào capPoints (< 3) ⇒ không tạo capPolygon.
        expect(capPolygon).toEqual([]);
    });

    it("góc vuông lồi (outer corner) → điểm miter dùng chung được 2 tường tham chiếu giống hệt nhau + capPolygon hợp lệ", () => {
        const east = wallAt(1, 0, 2);  // thickness 2 → half 1 (số tròn, dễ kiểm)
        const north = wallAt(0, 1, 2);
        const { miterPoints, capPolygon } = computeMiters({ x: 0, z: 0 }, [east, north]);

        const mEast = miterPoints.get(east.entity)!;
        const mNorth = miterPoints.get(north.entity)!;
        assertFinitePoint(mEast.leftPoint);
        assertFinitePoint(mEast.rightPoint);
        assertFinitePoint(mNorth.leftPoint);
        assertFinitePoint(mNorth.rightPoint);

        // Góc vuông: 1 trong 2 lượt xử lý cặp là "outer" (cross<0) → dùng miter, điểm chia sẻ
        // giữa north.leftPoint và east.rightPoint (xem computePair: w1=north,w2=east khi cross<0).
        expect(mNorth.leftPoint).toEqual(mEast.rightPoint);

        // capPoints: lượt "inner" (bevel) push 2 điểm + lượt "outer" (miter) push 1 điểm = 3
        // → đủ điều kiện tạo capPolygon (>=3).
        expect(capPolygon.length).toBe(3);
        for (const p of capPolygon) assertFinitePoint(p);
    });

    it("0 tường tại node → không có miterPoints/capPolygon", () => {
        const { miterPoints, capPolygon } = computeMiters({ x: 0, z: 0 }, []);
        expect(miterPoints.size).toBe(0);
        expect(capPolygon).toEqual([]);
    });
});
