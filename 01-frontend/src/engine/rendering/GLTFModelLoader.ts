import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from "three";
import type { TargetBBox } from "src/engine/game/FurnitureCatalog";

const _tempBox = new THREE.Box3();

/** Regex matching the _col / _collision suffix convention (case-insensitive, suffix-only). */
const COL_SUFFIX_RE = /_col(lision)?$/i;

/** Compute bbox from visible Mesh nodes only — excludes empties, lights, cameras, hidden objects. */
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

/** Full extents (not half-extents) of a designer-authored _col/_collision mesh, in metres. */
export type CollisionFootprint = { width: number; depth: number; height: number };

export type ModelTemplate = {
    scene: THREE.Group;
    bbox: THREE.Box3;
    size: THREE.Vector3;                     // visual size — unchanged
    collisionFootprint?: CollisionFootprint; // undefined when no _col node present
};

/**
 * Async GLB/GLTF loader with:
 *   - DRACO decompression support
 *   - Promise-based cache (one parse per assetPath)
 *   - In-flight deduplication (concurrent calls share one fetch)
 *   - Optional auto-scale: scales the model so its largest world-space dimension
 *     matches the largest dimension in targetBbox (uses uniform scale)
 *   - Pivot normalization: bottom-center at (0, 0, 0)
 */
export class GLTFModelLoader {
    private gltfLoader: GLTFLoader;
    private dracoLoader: DRACOLoader;
    private cache = new Map<string, ModelTemplate>();
    private inflight = new Map<string, Promise<ModelTemplate>>();

    constructor(decoderPath = "/draco/") {
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath(decoderPath); // trailing slash required
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

                    // Step 0 [NEW]: detect _col/_collision nodes by name.
                    // Set visible=false once and keep it — visibleMeshBbox (steps 1 & 4) uses
                    // the !node.visible guard, so _col nodes are automatically excluded from the
                    // visual bbox without any toggle.
                    const colNodes: THREE.Mesh[] = [];
                    root.traverse((node) => {
                        if ((node as THREE.Mesh).isMesh && COL_SUFFIX_RE.test(node.name)) {
                            node.visible = false;
                            colNodes.push(node as THREE.Mesh);
                        }
                    });

                    // Step 1: measure raw world-space bbox at scale=1 (visible meshes only)
                    root.updateMatrixWorld(true);
                    const rawBbox = visibleMeshBbox(root, new THREE.Box3());
                    const rawSize = rawBbox.getSize(new THREE.Vector3());

                    // Step 2: auto-scale so largest dimension matches targetBbox
                    if (targetBbox) {
                        const actualLargest = Math.max(rawSize.x, rawSize.y, rawSize.z);
                        const targetLargest = Math.max(targetBbox.width, targetBbox.depth, targetBbox.height);
                        if (actualLargest > 0) {
                            const scale = targetLargest / actualLargest;
                            root.scale.setScalar(scale);
                            root.updateMatrixWorld(true);
                        }
                    }

                    // Step 3: pivot normalize — bottom-center at world origin (visible meshes only)
                    const bbox = visibleMeshBbox(root, new THREE.Box3());
                    const center = bbox.getCenter(new THREE.Vector3());
                    root.position.x -= center.x;
                    root.position.z -= center.z;
                    root.position.y -= bbox.min.y; // lift bottom to y=0
                    root.updateMatrixWorld(true);

                    // Step 3.5 [NEW]: measure collision bbox directly from _col geometry +
                    // matrixWorld (after scale & pivot so it shares the same frame as finalBbox).
                    // No visible toggle — geometry+matrixWorld read is independent of visibility.
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

                    // Step 4: recompute final bbox for visual sizing (visible meshes only;
                    // _col nodes already have visible=false from step 0 → excluded automatically)
                    const finalBbox = visibleMeshBbox(root, new THREE.Box3());
                    const size = finalBbox.getSize(new THREE.Vector3());

                    // Step 4.5 [NEW]: remove _col nodes from the scene graph and dispose their
                    // GPU resources. Done before resolve() so the cached template.scene is
                    // already clean — all clones created downstream inherit the clean tree.
                    // (Invisible meshes still cast shadows and inflate clone memory; remove them.)
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

    dispose(): void {
        this.dracoLoader.dispose();
    }
}
