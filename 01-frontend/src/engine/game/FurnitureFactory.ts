import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { Selectable } from "src/engine/components/interaction/Selectable";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Model3D } from "src/engine/components/render/Model3D";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { GLTFModelLoader } from "src/engine/rendering/GLTFModelLoader";
import { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import type { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import { applyMaterialToSlot } from "src/engine/rendering/materialApply";
import { getAssetPath, getBoundingBox, getPlacement } from "src/engine/catalog/FurnitureCatalog";
import { resolveCollisionFootprint } from "src/engine/catalog/footprint";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { findMountWall } from "src/engine/adapters/wallRefs";
import { wallItemPose } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";

/**
 * FurnitureFactory — spawn nội thất vào scene + ECS.
 *
 * Hai con đường:
 *   - spawnFurniture    : placeholder BoxGeometry (đường cũ, dự phòng).
 *   - spawnFurnitureGLB : nạp model GLB thật qua GLTFModelLoader (đường chính,
 *                          bất đồng bộ). Kích thước va chạm giải qua chuỗi ưu tiên
 *                          _col mesh → JSON → AABB hiển thị (resolveCollisionFootprint).
 */

/** Kích thước bounding box xấp xỉ [width, height, depth] theo mét. */
export const FURNITURE_SIZES: Record<string, [number, number, number]> = {
    single_bed_01: [1.0, 0.45, 2.0],
    bunk_bed_01: [1.0, 1.8, 2.0],
    fridge_01: [0.7, 1.8, 0.7],
    wardrobe_01: [1.2, 2.0, 0.6],
    armchair_01: [0.9, 0.9, 0.9],
    dining_table_01: [1.6, 0.75, 0.9],
    floor_lamp_01: [0.3, 1.6, 0.3],
    plant_01: [0.5, 0.8, 0.5],
    mixer_01: [0.3, 0.4, 0.3],
    fireplace_01: [1.2, 1.0, 0.5],
    patio_set_01: [2.0, 0.8, 2.0],
    rug_01: [2.0, 0.02, 1.5],
};

const DEFAULT_SIZE: [number, number, number] = [0.8, 0.8, 0.8];

export function getFurnitureSize(modelId: string): [number, number, number] {
    return FURNITURE_SIZES[modelId] ?? DEFAULT_SIZE;
}

/**
 * Spawn một entity nội thất cố định tại (x, z) trên sàn bằng placeholder BoxGeometry.
 * Đường spawn cũ — đường chính hiện dùng spawnFurnitureGLB. Trả về ECS entity id.
 */
export function spawnFurniture(
    world: World,
    scene: THREE.Scene,
    modelId: string,
    x: number,
    z: number,
    meshRegistry: MeshRegistry,
    materialRegistry: MaterialRegistry,
): string {
    const [w, h, d] = getFurnitureSize(modelId);
    const y = h / 2;

    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = materialRegistry.get({ color: 0xa0856a, metalness: 0, roughness: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const entity = world.createEntity();
    meshRegistry.register(`furniture-${entity}`, mesh);

    world.addComponent(entity, new Transform(x, y, z, 0));
    world.addComponent(entity, new Mesh(mesh));
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(w / 2, h / 2, d / 2));
    world.addComponent(entity, new FurnitureTag(modelId));

    return entity;
}

/**
 * Spawn entity nội thất bằng model GLB thật, nạp qua GLTFModelLoader.
 * Model được clone từ cache của loader nên geometry dùng chung (tiết kiệm bộ nhớ).
 * Trả về ECS entity id (async — resolve sau khi GLB nạp xong và đã đặt).
 */
export async function spawnFurnitureGLB(
    world: World,
    scene: THREE.Scene,
    modelId: string,
    x: number,
    z: number,
    rotY: number = 0,
    loader: GLTFModelLoader,
    modelRegistry: ModelRegistry,
    materials?: Record<string, string>,
    materialLibrary?: MaterialLibrary,
    y?: number,
): Promise<string> {
    const assetPath = getAssetPath(modelId);
    const template = await loader.load(assetPath, getBoundingBox(modelId));

    const root = template.scene.clone(true);
    root.position.x = x;
    root.position.z = z;
    // Y: pivot GLB đã chuẩn hoá về đáy-mesh (y=0 ⇒ đứng trên sàn, tâm-AABB = sy/2).
    // Nếu có `y` lưu sẵn (đồ kê cao/treo), dịch root theo delta so với vị trí đứng sàn:
    // root.position.y = centerY − sy/2 (bằng 0 khi centerY = sy/2 ⇒ giữ nguyên hành vi cũ).
    const sy = template.size.y; // chiều cao hiển thị — giữ entity đứng trên sàn
    const centerY = y ?? sy / 2;
    root.position.y = centerY - sy / 2;
    if (rotY !== 0) {
        const half = rotY / 2;
        root.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
    }

    root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(root);

    const entity = world.createEntity();
    modelRegistry.register(entity, root);

    // Giải kích thước va chạm theo chuỗi ưu tiên: _col mesh → JSON → AABB hiển thị.
    // Transform.y = tâm-AABB (centerY): mặc định sy/2 (đứng sàn) hoặc giá trị đã lưu.
    // ColliderAABB dùng footprint đã giải để va chạm khớp với ý đồ designer.
    const fp = resolveCollisionFootprint(modelId, template);

    const model3d = new Model3D(root, modelId);
    world.addComponent(entity, new Transform(x, centerY, z, rotY));
    world.addComponent(entity, model3d);
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(fp.width / 2, fp.height / 2, fp.depth / 2));
    world.addComponent(entity, new FurnitureTag(modelId));

    // Re-apply material đã lưu (load-time). Bỏ qua nếu thiếu library hoặc rỗng.
    if (materials && materialLibrary) {
        await applyStoredMaterials(model3d, materials, materialLibrary);
    }

    return entity;
}

/** Áp lại các material đã lưu lên model (song song). Lỗi 1 slot không chặn các slot khác. */
async function applyStoredMaterials(
    model: Model3D,
    materials: Record<string, string>,
    lib: MaterialLibrary,
): Promise<void> {
    await Promise.all(
        Object.entries(materials).map(([slotId, materialId]) =>
            applyMaterialToSlot(model, slotId, materialId, lib).catch((err) =>
                console.error(`applyStoredMaterials slot=${slotId}:`, err),
            ),
        ),
    );
}

/**
 * Spawn một item BÁM TƯỜNG (kệ treo / cửa / cửa sổ) bằng model GLB thật.
 *
 * Khác spawnFurnitureGLB:
 *   - Vị trí/hướng suy từ topology tường (hostWallId, t, side) qua mountTransform.
 *   - Y đặt theo kiểu bám: "mount" canh tâm ở mountHeight; "opening" canh đáy ở sill.
 *   - KHÔNG gắn StaticBody/ColliderAABB → item nằm ngoài hệ va chạm (không bị tường
 *     host coi là chồng lấn). Gắn WallMounted hoặc WallOpening làm nguồn chân lý vị trí
 *     để WallMountSystem bám tường khi node di chuyển.
 *
 * Trả về ECS entity id (async — resolve sau khi GLB nạp xong).
 */
export async function spawnWallItemGLB(
    world: World,
    scene: THREE.Scene,
    modelId: string,
    hostWallId: string,
    t: number,
    side: number,
    loader: GLTFModelLoader,
    modelRegistry: ModelRegistry,
    nodeRegistry: NodeRegistry,
    materials?: Record<string, string>,
    materialLibrary?: MaterialLibrary,
): Promise<string> {
    const placement = getPlacement(modelId);
    const wall = findMountWall(world, nodeRegistry, hostWallId);
    if (!wall) throw new Error(`PLACE_WALL_ITEM: wall ${hostWallId} not found`);

    const template = await loader.load(getAssetPath(modelId), getBoundingBox(modelId));
    const root = template.scene.clone(true);

    const sx = template.size.x; // bề rộng hiển thị (dọc thân tường) — cho cut width mặc định
    const sy = template.size.y; // chiều cao hiển thị

    const isOpening = placement.behavior === "opening";
    // Pose (X/Z/yaw + baseY/centerY) qua nguồn chân lý chung — depth lấy từ footprint catalog.
    const dims = resolveWallItemDims(modelId, sy);
    const pose = wallItemPose(wall, t, side, dims);

    // root.position hiện mang offset chuẩn-hoá-pivot (đáy ở world 0 khi position như loaded).
    // Cộng baseY để nâng đáy lên đúng cao độ; X/Z set tuyệt đối (giống spawnFurnitureGLB).
    root.position.x = pose.x;
    root.position.z = pose.z;
    root.position.y += pose.baseY;
    const half = pose.rotY / 2;
    root.quaternion.set(0, Math.sin(half), 0, Math.cos(half));

    root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(root);

    const entity = world.createEntity();
    modelRegistry.register(entity, root);

    const model3d = new Model3D(root, modelId);
    world.addComponent(entity, new Transform(pose.x, pose.centerY, pose.z, pose.rotY));
    world.addComponent(entity, model3d);
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new FurnitureTag(modelId));

    // Re-apply material đã lưu (load-time).
    if (materials && materialLibrary) {
        await applyStoredMaterials(model3d, materials, materialLibrary);
    }

    if (isOpening) {
        const cutW = placement.cut?.width ?? sx;
        const cutH = placement.cut?.height ?? sy;
        world.addComponent(entity, new WallOpening(hostWallId, t, cutW, cutH, dims.sill, side));
    } else {
        world.addComponent(entity, new WallMounted(hostWallId, t, side, placement.mountHeight));
    }

    return entity;
}
