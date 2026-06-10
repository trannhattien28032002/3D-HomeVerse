/**
 * wallCornerJoiner — tính điểm nối góc (miter/bevel) cho các tường gặp nhau tại một node.
 *
 * Bài toán: nhiều tường dày giao tại một điểm; cần tìm các đỉnh để hai mép tường
 * khít nhau không hở, không chồng. Hai cách nối:
 *   - MITER  : kéo dài hai mép tới điểm giao (góc nhọn) — dùng khi góc đủ thoải và
 *              chiều dài miter không vượt MITER_LIMIT (tránh "gai" nhọn quá dài).
 *   - BEVEL  : cắt vát — dùng khi miter quá dài hoặc góc quá gắt.
 *
 * computeMiters(): sắp xếp tường radially quanh node rồi xử lý từng cặp liền kề,
 * trả về:
 *   - miterPoints: với mỗi tường, cặp điểm (leftPoint, rightPoint) ở đầu chạm node.
 *   - capPolygon : đa giác lấp khe ở junction ≥ 3 tường (cho WallGeometrySystem dựng cap).
 *
 * Quy ước vector: nx/nz là hướng tường ra khỏi node; leftN*rightN* là pháp tuyến
 * hai mép (trái/phải theo hướng đó); thickness là độ dày đầy đủ (chia 2 = half-extent).
 */
import type { Point2D } from "src/engine/components/wall/WallPolygon";

export type WallAtNode = {
    entity: string;
    nx: number; nz: number;
    thickness: number;
    angle: number;
    leftNx: number; leftNz: number;
    rightNx: number; rightNz: number;
};

/**
 * Tính điểm nối cho MỘT cặp tường liền kề (w1, w2).
 * Trả về điểm giao (miter) nếu dùng được; ngược lại ghi điểm bevel vào miterPoints
 * và trả về null. Toán: giải giao của hai đường mép offset từ tâm node.
 */
function computePair(
    nodePos: Point2D,
    w1: WallAtNode,
    w2: WallAtNode,
    miterPoints: Map<string, { leftPoint: Point2D; rightPoint: Point2D }>,
): Point2D | null {
    const h1 = w1.thickness / 2;
    const h2 = w2.thickness / 2;

    const n1x = w1.leftNx, n1z = w1.leftNz;
    const n2x = w2.rightNx, n2z = w2.rightNz;

    // c = cos góc giữa 2 pháp tuyến mép. parallel ⇒ hai mép song song, không có giao.
    const c = n1x * n2x + n1z * n2z;

    let inter: Point2D | null = null;
    const parallel = Math.abs(1 - c * c) < 1e-5;

    if (!parallel) {
        const a = (h1 - h2 * c) / (1 - c * c);
        const b = (h2 - h1 * c) / (1 - c * c);
        inter = {
            x: nodePos.x + a * n1x + b * n2x,
            z: nodePos.z + a * n1z + b * n2z,
        };
    }
    // cross < 0 ⇒ đây là góc "ngoài" (lồi) — chỉ góc ngoài mới dùng miter.
    const cross = w1.nx * w2.nz - w1.nz * w2.nx;
    const isOuter = cross < -1e-5;
    const MITER_LIMIT = 2.5; // chặn miter quá nhọn/dài → chuyển sang bevel
    const maxDist = Math.max(h1, h2) * MITER_LIMIT * 2;

    let useMiter = false;

    if (isOuter && inter) {
        const miterLength = Math.hypot(inter.x - nodePos.x, inter.z - nodePos.z);
        if (miterLength <= maxDist) {
            useMiter = true;
        }
    }

    if (useMiter && inter) {
        return inter;
    }

    const p1: Point2D = { x: nodePos.x + n1x * h1, z: nodePos.z + n1z * h1 };
    const p2: Point2D = { x: nodePos.x + n2x * h2, z: nodePos.z + n2z * h2 };

    let bevel1 = p1;
    let bevel2 = p2;

    if (!parallel && inter) {
        const t1Raw = (inter.x - nodePos.x) * w1.nx + (inter.z - nodePos.z) * w1.nz;
        const t2Raw = (inter.x - nodePos.x) * w2.nx + (inter.z - nodePos.z) * w2.nz;

        const t1 = Math.min(Math.max(t1Raw, 0), maxDist);
        const t2 = Math.min(Math.max(t2Raw, 0), maxDist);

        bevel1 = { x: nodePos.x + t1 * w1.nx + n1x * h1, z: nodePos.z + t1 * w1.nz + n1z * h1 };
        bevel2 = { x: nodePos.x + t2 * w2.nx + n2x * h2, z: nodePos.z + t2 * w2.nz + n2z * h2 };
    }

    if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
    if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });

    miterPoints.get(w1.entity)!.leftPoint = bevel1;
    miterPoints.get(w2.entity)!.rightPoint = bevel2;

    return null;
}

export function computeMiters(
    nodePos: Point2D,
    walls: WallAtNode[],
): {
    miterPoints: Map<string, { leftPoint: Point2D; rightPoint: Point2D }>;
    capPolygon: Point2D[];
} {
    const miterPoints = new Map<string, { leftPoint: Point2D; rightPoint: Point2D }>();

    if (walls.length === 0) return { miterPoints, capPolygon: [] };
    const sorted = [...walls].sort((a, b) => a.angle - b.angle);

    if (sorted.length === 1) {
        const w = sorted[0];
        const h = w.thickness / 2;
        miterPoints.set(w.entity, {
            leftPoint: { x: nodePos.x + w.leftNx * h, z: nodePos.z + w.leftNz * h },
            rightPoint: { x: nodePos.x + w.rightNx * h, z: nodePos.z + w.rightNz * h },
        });
        return { miterPoints, capPolygon: [] };
    }

    const capPoints: Point2D[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const w1 = sorted[i];
        const w2 = sorted[(i + 1) % sorted.length];

        let angleDiff = w2.angle - w1.angle;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

        // Hai tường gần như thẳng hàng (180°): nối thẳng bằng một điểm mép chung.
        if (Math.abs(Math.abs(angleDiff) - Math.PI) < 1e-3) {
            const h1 = w1.thickness / 2;
            const p1: Point2D = { x: nodePos.x + w1.leftNx * h1, z: nodePos.z + w1.leftNz * h1 };
            if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            miterPoints.get(w1.entity)!.leftPoint = p1;
            miterPoints.get(w2.entity)!.rightPoint = p1;
            capPoints.push(p1);
            continue;
        }

        const sharedPoint = computePair(nodePos, w1, w2, miterPoints);
        if (sharedPoint !== null) {
            if (!miterPoints.has(w1.entity)) miterPoints.set(w1.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            if (!miterPoints.has(w2.entity)) miterPoints.set(w2.entity, { leftPoint: { x: 0, z: 0 }, rightPoint: { x: 0, z: 0 } });
            miterPoints.get(w1.entity)!.leftPoint = sharedPoint;
            miterPoints.get(w2.entity)!.rightPoint = sharedPoint;
            capPoints.push(sharedPoint);
        } else {
            const pLeft = miterPoints.get(w1.entity)!.leftPoint;
            const pRight = miterPoints.get(w2.entity)!.rightPoint;
            capPoints.push(pLeft, pRight);
        }
    }

    const capPolygon = capPoints.length >= 3 ? capPoints : [];
    return { miterPoints, capPolygon };
}
