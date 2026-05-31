import * as THREE from "three";
import { Component } from "src/engine/ecs/Component";

export type MaterialOverride = {
    variantId?: string;
    color?: number;
    roughness?: number;
    metalness?: number;
    texturePath?: string;
};

/**
 * Marks an entity as owning a GLB-loaded Three.js Group.
 * `root` is the top-level Object3D added to the scene.
 * `modelId` is the catalog key used to load the asset.
 */
export class Model3D extends Component {
    root: THREE.Object3D;
    modelId: string;
    materialOverrides?: Map<string, MaterialOverride>;

    constructor(root: THREE.Object3D, modelId: string) {
        super();
        this.root = root;
        this.modelId = modelId;
    }
}
