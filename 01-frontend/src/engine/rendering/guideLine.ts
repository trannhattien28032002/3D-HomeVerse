import * as THREE from "three";

export type GuideSegment = { x1: number; z1: number; x2: number; z2: number };

export function createGuideLine(scene: THREE.Scene): THREE.Line {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color: 0xf8b400, depthTest: false, transparent: true }),
    );
    line.renderOrder = 999;
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    return line;
}

export function setGuideLine(line: THREE.Line, guides: GuideSegment[]): void {
    if (guides.length === 0) { line.visible = false; return; }
    const g = guides[0];
    const y = 0.02; // nhô nhẹ trên sàn tránh z-fight
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, g.x1, y, g.z1);
    pos.setXYZ(1, g.x2, y, g.z2);
    pos.needsUpdate = true;
    line.visible = true;
}

export function disposeGuideLine(scene: THREE.Scene, line: THREE.Line): void {
    scene.remove(line);
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
}
