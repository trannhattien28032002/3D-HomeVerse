/**
 * wallMeshBuilder — biến đa giác mặt bằng (XZ) của tường thành mesh 3D.
 *
 * buildExtrudeGeo: extrude (đùn) một Shape XZ lên cao `depth` rồi xoay về hệ Y-up.
 * rebuildWallMesh: thay geometry cho một mesh tường đã có (dispose cái cũ trước).
 * Dùng bởi WallGeometrySystem mỗi khi polygon tường/cap thay đổi.
 */
import * as THREE from "three";
import type { Point2D } from "src/engine/components/wall/WallPolygon";

/** Dựng ExtrudeGeometry từ đa giác XZ, xoay về không gian Y-up. */
export function buildExtrudeGeo(polygon: Point2D[], depth: number, offsetY: number): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, -polygon[0].z);
    for (let i = 1; i < polygon.length; i++)
        shape.lineTo(polygon[i].x, -polygon[i].z);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -offsetY, 0);
    return geo;
}

/** Dựng lại geometry cho một mesh tường đã có từ đa giác 4 điểm world-space. */
export function rebuildWallMesh(
    mesh: THREE.Mesh,
    worldPoly: [Point2D, Point2D, Point2D, Point2D],
    height: number,
    wallY: number,
): void {
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = buildExtrudeGeo(worldPoly, height, wallY);
    mesh.rotation.set(0, 0, 0);
    mesh.position.set(0, wallY, 0);
}
