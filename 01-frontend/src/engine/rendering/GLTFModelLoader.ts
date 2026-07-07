import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from "three";
import type { TargetBBox } from "src/engine/catalog/FurnitureCatalog";

const _tempBox = new THREE.Box3();

const COL_SUFFIX_RE = /_col(lision)?$/i;

/** Dispose mọi texture map gắn trên material (map/normalMap/roughnessMap/…), rồi dispose chính material. */
function disposeMaterial(material: THREE.Material): void {
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) value.dispose();
    }
    material.dispose();
}

/** Dispose geometry + material (+ texture) của mọi mesh trong một ModelTemplate đã cache. Khử trùng lặp vì GLTFLoader dedupe material/geometry dùng chung trong cùng 1 GLB. */
function disposeTemplate(template: ModelTemplate): void {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    template.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
            disposedGeometries.add(mesh.geometry);
            mesh.geometry.dispose();
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
            if (mat && !disposedMaterials.has(mat)) {
                disposedMaterials.add(mat);
                disposeMaterial(mat);
            }
        }
    });
}

function visibleMeshBbox(root: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
    out.makeEmpty();
    root.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh || !node.visible) return;
        node.updateWorldMatrix(true, false);
        const geo = (node as THREE.Mesh).geometry;
        if (geo?.attributes?.position) {
            _tempBox.setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
            _tempBox.applyMatrix4(node.matrixWorld);
            out.union(_tempBox);
        }
    });
    if (out.isEmpty()) out.setFromObject(root);
    return out;
}

export type CollisionFootprint = { width: number; depth: number; height: number };

export type ModelTemplate = {
    scene: THREE.Group;
    bbox: THREE.Box3;
    size: THREE.Vector3;
    collisionFootprint?: CollisionFootprint;
};

export class GLTFModelLoader {
    private gltfLoader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private cache = new Map<string, ModelTemplate>();
    private inflight = new Map<string, Promise<ModelTemplate>>();

    constructor(decoderPath = "/draco/") {
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath(decoderPath);
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setDRACOLoader(this.dracoLoader);
    }

    async load(assetPath: string, targetBbox?: TargetBBox): Promise<ModelTemplate> {
        if (this.cache.has(assetPath)) return this.cache.get(assetPath)!;
        if (this.inflight.has(assetPath)) return this.inflight.get(assetPath)!;

        const promise = new Promise<ModelTemplate>((resolve, reject) => {
            this.gltfLoader.load(
                assetPath,
                (gltf) => {
                    const root = gltf.scene;

                    const colNodes: THREE.Mesh[] = [];
                    root.traverse((node) => {
                        if ((node as THREE.Mesh).isMesh && COL_SUFFIX_RE.test(node.name)) {
                            node.visible = false;
                            colNodes.push(node as THREE.Mesh);
                        }
                    });

                    root.updateMatrixWorld(true);
                    const rawBbox = visibleMeshBbox(root, new THREE.Box3());
                    const rawSize = rawBbox.getSize(new THREE.Vector3());

                    if (targetBbox) {
                        const actualLargest = Math.max(rawSize.x, rawSize.y, rawSize.z);
                        const targetLargest = Math.max(targetBbox.width, targetBbox.depth, targetBbox.height);
                        if (actualLargest > 0) {
                            const scale = targetLargest / actualLargest;
                            root.scale.setScalar(scale);
                            root.updateMatrixWorld(true);
                        }
                    }

                    const bbox = visibleMeshBbox(root, new THREE.Box3());
                    const center = bbox.getCenter(new THREE.Vector3());
                    root.position.x -= center.x;
                    root.position.z -= center.z;
                    root.position.y -= bbox.min.y; // nâng đáy lên y=0
                    root.updateMatrixWorld(true);

                    let collisionFootprint: CollisionFootprint | undefined;
                    if (colNodes.length > 0) {
                        const colBbox = new THREE.Box3();
                        for (const node of colNodes) {
                            node.updateWorldMatrix(true, false);
                            const geo = node.geometry;
                            if (geo?.attributes?.position) {
                                _tempBox.setFromBufferAttribute(
                                    geo.attributes.position as THREE.BufferAttribute,
                                );
                                _tempBox.applyMatrix4(node.matrixWorld);
                                colBbox.union(_tempBox);
                            }
                        }
                        if (!colBbox.isEmpty()) {
                            const colSize = colBbox.getSize(new THREE.Vector3());
                            collisionFootprint = {
                                width: colSize.x,
                                depth: colSize.z,
                                height: colSize.y,
                            };
                        }
                    }

                    const finalBbox = visibleMeshBbox(root, new THREE.Box3());
                    const size = finalBbox.getSize(new THREE.Vector3());

                    for (const node of colNodes) {
                        node.removeFromParent();
                        node.geometry.dispose();
                        if (Array.isArray(node.material)) {
                            node.material.forEach((m) => m.dispose());
                        } else {
                            (node.material as THREE.Material).dispose();
                        }
                    }

                    const template: ModelTemplate = { scene: root, bbox: finalBbox, size, collisionFootprint };
                    this.cache.set(assetPath, template);
                    this.inflight.delete(assetPath);
                    resolve(template);
                },
                undefined,
                (err) => {
                    this.inflight.delete(assetPath);
                    reject(err);
                },
            );
        });

        this.inflight.set(assetPath, promise);
        return promise;
    }

    /**
     * Dispose toàn bộ GPU resource (geometry/material/texture) của mọi ModelTemplate
     * đang cache, rồi clear cache. Gọi khi engine teardown (rời editor) — an toàn vì
     * lúc đó mọi instance đã clone từ cache cũng bị gỡ khỏi scene cùng lượt teardown
     * (xem ModelRegistry.disposeAll, không tự dispose geometry/material dùng chung).
     */
    dispose(): void {
        for (const template of this.cache.values()) {
            disposeTemplate(template);
        }
        this.cache.clear();
        this.inflight.clear();
        this.dracoLoader.dispose();
    }
}
