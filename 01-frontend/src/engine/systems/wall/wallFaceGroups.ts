/**
 * wallFaceGroups — gán material GROUPS cho geometry thân tường để sơn riêng 2 mặt.
 *
 * materialIndex quy ước: 0 = LEFT, 1 = RIGHT, 2 = OTHER (mép đầu, nóc, đáy, reveal lỗ cửa).
 *
 * Phân loại theo HALF-SPACE so với tim tường (KHÔNG theo faceIndex range, KHÔNG theo
 * ngưỡng normal thuần): CSG (cửa) xáo thứ tự triangle và miter góc nhọn làm mặt dài
 * nghiêng → chỉ có "tam giác này nằm phía nào của tim tường" là bất biến.
 *   - |normal.y| > 0.5 → OTHER (nóc/đáy).
 *   - ngược lại: chiếu centroid lên leftNormal so với tâm tường → >+ε LEFT, <-ε RIGHT,
 *     |.|≤ε OTHER (mép đầu + reveal lỗ nằm sát tim).
 *
 * Gọi BÊN TRONG builder thân tường (rebuildWallMesh, buildCutWallGeo) nên mọi geometry
 * tường luôn mang sẵn groups — các system swap geometry không cần hook gì thêm. Tường
 * chưa sơn để mesh.material là single material → three.js bỏ qua groups (zero regression).
 *
 * Geometry tường bake world-space XZ (= polygon.x/z), rotation=0; offsetY chỉ dời Y nên
 * classify chỉ cần XZ của centroid + thành phần Y của normal.
 */
import * as THREE from "three";
import type { Point2D } from "src/engine/components/wall/WallPolygon";

export const WALL_FACE_LEFT = 0;
export const WALL_FACE_RIGHT = 1;
export const WALL_FACE_OTHER = 2;

/**
 * Pháp tuyến "trái" (XZ, unit) của tường từ polygon footprint
 * [startLeft, endLeft, endRight, startRight]. Null nếu tường suy biến (quá ngắn).
 */
export function wallLeftNormal(poly: Point2D[]): { x: number; z: number } | null {
    if (poly.length < 4) return null;
    const sMidX = (poly[0].x + poly[3].x) / 2, sMidZ = (poly[0].z + poly[3].z) / 2;
    const eMidX = (poly[1].x + poly[2].x) / 2, eMidZ = (poly[1].z + poly[2].z) / 2;
    const dx = eMidX - sMidX, dz = eMidZ - sMidZ;
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-6)) return null; // bắt cả NaN (polygon suy biến / không hữu hạn)
    const ux = dx / len, uz = dz / len;
    let lx = -uz, lz = ux; // rot 90° → phía "trái"
    // Đảm bảo hướng về p0 (startLeft) để khớp quy ước LEFT = cạnh p0→p1.
    const tox = poly[0].x - sMidX, toz = poly[0].z - sMidZ;
    if (lx * tox + lz * toz < 0) { lx = -lx; lz = -lz; }
    return { x: lx, z: lz };
}

/**
 * Gán groups [0=left, 1=right, 2=other] cho geometry tường theo half-space.
 * No-op nếu polygon suy biến. Hỗ trợ cả geometry indexed (ExtrudeGeometry) lẫn
 * non-indexed (output three-bvh-csg).
 */
export function classifyWallFaceGroups(geo: THREE.BufferGeometry, poly: Point2D[]): void {
    if (poly.length < 4) return;
    const left = wallLeftNormal(poly);
    if (!left) return;

    // Tâm tường (XZ) + ngưỡng theo bề dày (khoảng cách 2 mép tại đầu start).
    const cx = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
    const cz = (poly[0].z + poly[1].z + poly[2].z + poly[3].z) / 4;
    const thickness = Math.hypot(poly[0].x - poly[3].x, poly[0].z - poly[3].z);
    const eps = Math.max(thickness * 0.25, 1e-4);

    geo.clearGroups();

    const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const index = geo.getIndex();
    const triCount = index ? index.count / 3 : pos.count / 3;

    const vi = (tri: number, corner: number): number =>
        index ? index.getX(tri * 3 + corner) : tri * 3 + corner;

    let runStart = 0;
    let runIndex = -1;

    const flush = (endTri: number) => {
        if (runIndex >= 0 && endTri > runStart) {
            geo.addGroup(runStart * 3, (endTri - runStart) * 3, runIndex);
        }
    };

    for (let t = 0; t < triCount; t++) {
        const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
        const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
        const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
        const dx2 = pos.getX(c), dy2 = pos.getY(c), dz2 = pos.getZ(c);

        // pháp tuyến mặt = cross(b-a, c-a). Cần |n.y|/|n| để loại nóc/đáy.
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = dx2 - ax, e2y = dy2 - ay, e2z = dz2 - az;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const nlen = Math.hypot(nx, ny, nz);

        let mat: number;
        if (nlen > 1e-12 && Math.abs(ny / nlen) > 0.5) {
            mat = WALL_FACE_OTHER; // nóc/đáy
        } else {
            const gx = (ax + bx + dx2) / 3;
            const gz = (az + bz + dz2) / 3;
            const offset = (gx - cx) * left.x + (gz - cz) * left.z;
            mat = offset > eps ? WALL_FACE_LEFT : offset < -eps ? WALL_FACE_RIGHT : WALL_FACE_OTHER;
        }

        if (mat !== runIndex) {
            flush(t);
            runStart = t;
            runIndex = mat;
        }
    }
    flush(triCount);
}
