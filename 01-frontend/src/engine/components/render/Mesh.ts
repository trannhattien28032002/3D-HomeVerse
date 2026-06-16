import * as THREE from "three";
import { Component } from "src/engine/ecs/Component";

/**
 * Mesh — bọc một THREE.Mesh để gắn vào entity (dùng cho hình học tự dựng:
 * tường, sàn, gizmo...). RenderSystem đồng bộ Transform → mesh.position/rotation.
 * Khác với Model3D (vốn dành cho cả một Group nạp từ file GLB).
 */
export class Mesh extends Component {
    mesh: THREE.Mesh;

    constructor(mesh: THREE.Mesh) {
        super();
        this.mesh = mesh;
    }
}