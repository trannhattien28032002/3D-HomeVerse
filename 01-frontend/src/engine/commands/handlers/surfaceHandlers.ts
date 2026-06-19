/**
 * surfaceHandlers — material cho bề mặt procedural (tường + sàn phòng).
 *
 * SET_WALL_MATERIAL: ghi SurfaceMaterial component lên wall entity + gán mesh.material.
 *   Wall body mesh bền qua rebuild geometry (WallGeometrySystem chỉ swap geometry) nên
 *   không cần re-apply mỗi frame.
 * SET_FLOOR_MATERIAL: ghi registry roomKey→materialId + gán mesh sàn hiện tại.
 *   RoomSystem re-apply khi dựng lại floor mesh (đổi topology).
 */
import type * as THREE from "three";
import { Mesh } from "src/engine/components/render/Mesh";
import { SurfaceMaterial } from "src/engine/components/render/SurfaceMaterial";
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";
import { buildSurfaceMaterial, releaseSurfaceMaterial } from "src/engine/rendering/surfaceMaterial";
import { WALL_DEFAULT_MATERIAL, FLOOR_DEFAULT_MATERIAL } from "src/engine/rendering/surfaceDefaults";
import { Query } from "src/engine/ecs/Query";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

type SetWallMaterialCmd = Extract<EngineCommand, { type: "SET_WALL_MATERIAL" }>;
type SetFloorMaterialCmd = Extract<EngineCommand, { type: "SET_FLOOR_MATERIAL" }>;
type ResetWallMaterialCmd = Extract<EngineCommand, { type: "RESET_WALL_MATERIAL" }>;
type ResetFloorMaterialCmd = Extract<EngineCommand, { type: "RESET_FLOOR_MATERIAL" }>;

/**
 * Dựng lại mesh.material của thân tường từ SurfaceMaterial.faces theo quy ước groups
 * [0=left, 1=right, 2=other]. Mặt thiếu / other → material default. Nếu cả 2 mặt trống
 * → trả về single material default (bỏ array cho nhẹ; groups bị ignore).
 *
 * buildSurfaceMaterial là async (load texture) → gán material array sau khi cả 2 mặt
 * resolve trong MỘT lần để tránh nhiển thị nửa vời.
 */
function reskinWall(entity: string, deps: DispatcherDeps): void {
    const { world, materialRegistry, materialLibrary } = deps;
    const meshComp = world.getComponent(entity, Mesh);
    if (!meshComp) return;

    // Material đang gắn — release SAU khi gán material mới để thu hồi GPU khi đổi mặt (C2).
    const prev = meshComp.mesh.material;
    const surf = world.getComponent(entity, SurfaceMaterial);
    const def = materialRegistry.get(WALL_DEFAULT_MATERIAL);

    if (!surf || surf.isEmpty()) {
        meshComp.mesh.material = def; // single → three.js bỏ qua groups (như cũ)
        releaseSurfaceMaterial(prev);
        return;
    }

    const loadFace = (id?: string) =>
        id ? buildSurfaceMaterial(materialLibrary, id).then((m) => m ?? def).catch(() => def) : Promise.resolve(def);

    Promise.all([loadFace(surf.faces.left), loadFace(surf.faces.right)])
        .then(([left, right]) => {
            // Component có thể đã đổi trong lúc await — đọc lại để gán đúng trạng thái mới nhất.
            const cur = world.getComponent(entity, SurfaceMaterial);
            if (!cur || cur.isEmpty()) { meshComp.mesh.material = def; releaseSurfaceMaterial(prev); return; }
            meshComp.mesh.material = [left, right, def]; // [LEFT, RIGHT, OTHER]
            releaseSurfaceMaterial(prev);
        })
        .catch((err) => console.error("reskinWall failed:", err));
}

export function handleSetWallMaterial(command: SetWallMaterialCmd, deps: DispatcherDeps): void {
    const { world, wallEntityByWallId } = deps;
    const entity = wallEntityByWallId.get(command.wallId);
    if (!entity) return;

    const existing = world.getComponent(entity, SurfaceMaterial);
    if (existing) existing.faces[command.face] = command.materialId;
    else world.addComponent(entity, new SurfaceMaterial({ [command.face]: command.materialId }));

    reskinWall(entity, deps);
}

/**
 * Tìm mesh sàn của phòng khớp `roomKey` rồi gọi `apply(mesh)`. No-op nếu phòng/mesh
 * chưa tồn tại. Gom khối Query RoomGeometry → meshRegistry dùng chung cho SET/RESET.
 */
function withRoomFloorMesh(
    roomKey: string,
    deps: DispatcherDeps,
    apply: (mesh: THREE.Mesh) => void,
): void {
    const { world, meshRegistry } = deps;
    for (const e of Query.entitiesWith(world, RoomGeometry)) {
        const geo = world.getComponent(e, RoomGeometry)!;
        if (geo.key !== roomKey) continue;
        const mesh = meshRegistry.get(`room-${e}`);
        if (mesh) apply(mesh);
        break;
    }
}

export function handleSetFloorMaterial(command: SetFloorMaterialCmd, deps: DispatcherDeps): void {
    const { materialLibrary, floorMaterials } = deps;
    floorMaterials.set(command.roomKey, command.materialId);

    // Áp ngay lên mesh sàn của phòng hiện có khớp roomKey (nếu đang tồn tại).
    withRoomFloorMesh(command.roomKey, deps, (mesh) => {
        const prev = mesh.material;
        buildSurfaceMaterial(materialLibrary, command.materialId)
            .then((mat) => { if (mat) { mesh.material = mat; releaseSurfaceMaterial(prev); } })
            .catch((err) => console.error("SET_FLOOR_MATERIAL failed:", err));
    });
}

/** Khôi phục material mặc định cho MỘT MẶT tường: xoá faces[face]; cả 2 trống → gỡ component. */
export function handleResetWallMaterial(command: ResetWallMaterialCmd, deps: DispatcherDeps): void {
    const { world, wallEntityByWallId } = deps;
    const entity = wallEntityByWallId.get(command.wallId);
    if (!entity) return;

    const surf = world.getComponent(entity, SurfaceMaterial);
    if (surf) {
        delete surf.faces[command.face];
        if (surf.isEmpty()) world.removeComponent(entity, SurfaceMaterial);
    }
    reskinWall(entity, deps);
}

/** Khôi phục material mặc định cho sàn: xoá registry + gán lại mesh sàn mặc định. */
export function handleResetFloorMaterial(command: ResetFloorMaterialCmd, deps: DispatcherDeps): void {
    const { materialRegistry, floorMaterials } = deps;
    floorMaterials.delete(command.roomKey);

    withRoomFloorMesh(command.roomKey, deps, (mesh) => {
        const prev = mesh.material;
        mesh.material = materialRegistry.get(FLOOR_DEFAULT_MATERIAL);
        releaseSurfaceMaterial(prev); // thu hồi surface-material cũ về default (C2)
    });
}
