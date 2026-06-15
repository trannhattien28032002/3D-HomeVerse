import * as THREE from "three";
import { Component } from "src/engine/ecs/Component";

/** Ghi đè vật liệu cho một sub-mesh (đổi màu/độ nhám/độ kim loại/texture). */
export type MaterialOverride = {
    variantId?: string;
    color?: number;
    roughness?: number;
    metalness?: number;
    texturePath?: string;
};

/**
 * Model3D — đánh dấu entity sở hữu một Group Three.js nạp từ file GLB.
 *
 * `root`   : Object3D gốc đã được add vào scene.
 * `modelId`: khoá trong catalog dùng để nạp asset.
 * `materialOverrides`: map theo tên sub-mesh → tuỳ biến vật liệu (nếu có).
 */
export class Model3D extends Component {
    root: THREE.Object3D;
    modelId: string;
    materialOverrides?: Map<string, MaterialOverride>;

    /**
     * Cache do `materialApply` dựng lười 1 lần: slotId → các sub-mesh thuộc slot
     * (khớp theo material.name gốc). Tránh traverse lại mỗi lần đổi material.
     */
    slotIndex?: Map<string, THREE.Mesh[]>;
    /**
     * Material gốc của từng sub-mesh (mesh.uuid → material) chụp trước khi ghi đè,
     * để có thể revert về mặc định nếu cần.
     */
    originalMaterials?: Map<string, THREE.Material | THREE.Material[]>;

    constructor(root: THREE.Object3D, modelId: string) {
        super();
        this.root = root;
        this.modelId = modelId;
    }
}
