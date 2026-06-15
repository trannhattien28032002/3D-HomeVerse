import { Component } from "src/engine/ecs/Component";

/** Mặt tường sơn được độc lập. (Mép đầu/nóc/đáy = OTHER, luôn dùng default.) */
export type WallFace = "left" | "right";

/**
 * SurfaceMaterial — material PBR đã chọn cho thân tường, RIÊNG từng mặt (left/right).
 *
 * Khác Model3D.materialOverrides (GLB nhiều slot), đây là tối đa 2 material cho 2 mặt
 * lớn của tường; mặt thiếu trong `faces` → dùng default. Render qua material GROUPS
 * (xem wallFaceGroups): mesh.material = [left, right, default]. Gắn lên wall entity
 * (bền qua rebuild geometry) nên material giữ nguyên khi WallGeometrySystem dựng lại
 * hình. Sàn KHÔNG dùng component này (room entity ephemeral) — material sàn lưu ở
 * registry roomKey→materialId.
 */
export class SurfaceMaterial extends Component {
    faces: { left?: string; right?: string };

    constructor(faces: { left?: string; right?: string } = {}) {
        super();
        this.faces = faces;
    }

    /** True nếu không còn mặt nào được sơn (cả 2 trống) → có thể trả mesh về default đơn. */
    isEmpty(): boolean {
        return !this.faces.left && !this.faces.right;
    }
}
