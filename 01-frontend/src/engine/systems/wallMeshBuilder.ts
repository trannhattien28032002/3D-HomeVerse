import * as THREE from "three";
import type { Point2D } from "src/engine/components/WallPolygon";

/** Build an ExtrudeGeometry from an XZ polygon, rotated into Y-up space. */
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

/** Rebuild an existing wall mesh geometry from its 4-point world polygon. */
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
