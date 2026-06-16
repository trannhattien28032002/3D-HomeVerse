import * as THREE from "three";
import { Model3D } from "src/engine/components/render/Model3D";
import type { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import { getMaterialBindings } from "src/engine/catalog/FurnitureCatalog";

function ensureSlotIndex(model: Model3D): Map<string, THREE.Mesh[]> {
    if (model.slotIndex) return model.slotIndex;

    const nameToSlot = new Map<string, string>();
    for (const b of getMaterialBindings(model.modelId)) {
        nameToSlot.set(b.materialName, b.slotId);
    }

    const slotIndex = new Map<string, THREE.Mesh[]>();
    const originals = new Map<string, THREE.Material | THREE.Material[]>();

    model.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material;
        const matName = Array.isArray(mat) ? mat[0]?.name : mat?.name;
        if (!matName) return;
        const slotId = nameToSlot.get(matName);
        if (!slotId) return;

        let arr = slotIndex.get(slotId);
        if (!arr) { arr = []; slotIndex.set(slotId, arr); }
        arr.push(mesh);
        originals.set(mesh.uuid, mesh.material);
    });

    model.slotIndex = slotIndex;
    model.originalMaterials = originals;
    return slotIndex;
}

export async function applyMaterialToSlot(
    model: Model3D,
    slotId: string,
    materialId: string,
    lib: MaterialLibrary,
): Promise<void> {
    const meshes = ensureSlotIndex(model).get(slotId);
    if (!meshes || meshes.length === 0) return;

    const mat = await lib.loadMaterial(materialId);
    if (!mat) return;

    for (const mesh of meshes) mesh.material = mat;

    if (!model.materialOverrides) model.materialOverrides = new Map();
    model.materialOverrides.set(slotId, { variantId: materialId });
}

export function resetSlotToOriginal(model: Model3D, slotId: string): void {
    const meshes = model.slotIndex?.get(slotId);
    if (meshes && model.originalMaterials) {
        for (const mesh of meshes) {
            const orig = model.originalMaterials.get(mesh.uuid);
            if (orig) mesh.material = orig;
        }
    }
    model.materialOverrides?.delete(slotId);
}
