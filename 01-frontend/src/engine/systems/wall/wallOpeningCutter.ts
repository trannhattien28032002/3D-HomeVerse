/**
 * wallOpeningCutter — khoét lỗ (cửa / cửa sổ) trên geometry tường bằng three-bvh-csg.
 *
 * Geometry tường tuân theo quy ước WorldSpaceMesh: XZ bake sẵn world-space, còn Y
 * CĂN GIỮA (offsetY = height/2 → Y ∈ [-h/2, +h/2]); RenderSystem nâng lên đúng cao
 * độ bằng position.y = transform.y = height/2. Hệ này dựng lại bản căn-giữa y hệt
 * tường đặc (rebuildWallMesh) rồi trừ (SUBTRACTION) từng hộp lỗ → kết quả vẫn căn
 * giữa Y, để RenderSystem nâng cho ra [0, height] (KHÔNG bị đẩy lên cao).
 *
 * Hộp lỗ: rộng `width` dọc thân tường (trục X local sau khi xoay theo hướng tường),
 * cao `height` theo Y, dày = thickness×1.4 (vượt 2 mặt tường để cắt thủng hẳn),
 * tâm tại (điểm-trên-tim-tường ở t, sill + height/2 − offsetY) trong không gian căn-giữa.
 *
 * CHI PHÍ CAO — chỉ gọi khi (polygon | height | openings) đổi (WallOpeningSystem cache).
 */
import * as THREE from "three";
import { Evaluator, Brush, SUBTRACTION } from "three-bvh-csg";

import { buildExtrudeGeo } from "src/engine/systems/wall/wallMeshBuilder";
import { classifyWallFaceGroups } from "src/engine/systems/wall/wallFaceGroups";
import type { Point2D } from "src/engine/components/wall/WallPolygon";
import type { MountWall } from "src/shared/geometry/wallMount";

export interface OpeningCut {
    t: number;
    width: number;
    height: number;
    sill: number;
}

/**
 * Tạo một Evaluator (three-bvh-csg) cấu hình sẵn cho cắt tường. Trả về INSTANCE để
 * mỗi WallOpeningSystem sở hữu riêng — không còn singleton cấp-module giữ BVH buffer
 * suốt vòng đời module (rò rỉ khi hot-reload / nhiều engine, không test song song được). (H2)
 */
export function createWallEvaluator(): Evaluator {
    const e = new Evaluator();
    e.useGroups = false; // 1 nhóm vật liệu — tường dùng 1 material duy nhất.
    return e;
}

/**
 * Trả về geometry tường (world-space) đã khoét các lỗ. Caller chịu trách nhiệm
 * dispose geometry cũ của mesh trước khi gán kết quả này.
 *
 * `evaluator` nên do caller (WallOpeningSystem) cấp và tái dùng; default tạo mới mỗi
 * lần chỉ phục vụ test/đường gọi lẻ (không dùng trong hot path).
 */
export function buildCutWallGeo(
    poly: Point2D[],
    height: number,
    wall: MountWall,
    openings: OpeningCut[],
    evaluator: Evaluator = createWallEvaluator(),
): THREE.BufferGeometry {
    // Căn giữa Y khớp quy ước WorldSpaceMesh (như rebuildWallMesh & cap mesh) → RenderSystem
    // nâng position.y = height/2 cho ra [0, height]. Dùng offsetY = 0 sẽ bị đẩy lên cao height/2.
    const offsetY = height / 2;
    const baseGeo = buildExtrudeGeo(poly, height, offsetY); // Y ∈ [-h/2, +h/2]
    if (openings.length === 0) {
        classifyWallFaceGroups(baseGeo, poly);
        return baseGeo;
    }

    const dx = wall.bx - wall.ax;
    const dz = wall.bz - wall.az;
    const len = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / len;
    const uz = dz / len;
    // Xoay hộp lỗ sao cho trục X local trùng hướng tường (three.js Y-rotation).
    const yaw = Math.atan2(-uz, ux);

    let resultBrush = new Brush(baseGeo);
    resultBrush.updateMatrixWorld();

    // Dispose mọi geometry trung gian (gồm baseGeo) sau khi xong.
    const intermediates: THREE.BufferGeometry[] = [];

    for (const op of openings) {
        const cx = wall.ax + ux * (op.t * len);
        const cz = wall.az + uz * (op.t * len);

        const holeGeo = new THREE.BoxGeometry(op.width, op.height, wall.thickness * 1.4);
        const hole = new Brush(holeGeo);
        hole.position.set(cx, op.sill + op.height / 2 - offsetY, cz);
        hole.rotation.y = yaw;
        hole.updateMatrixWorld();

        const next = evaluator.evaluate(resultBrush, hole, SUBTRACTION);
        holeGeo.dispose();
        intermediates.push(resultBrush.geometry);
        resultBrush = next;
    }

    const out = resultBrush.geometry;
    for (const g of intermediates) g.dispose();
    classifyWallFaceGroups(out, poly); // re-group sau CSG (thứ tự triangle đã bị xáo)
    return out;
}
