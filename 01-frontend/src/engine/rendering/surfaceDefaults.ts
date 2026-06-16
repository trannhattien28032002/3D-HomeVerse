/**
 * surfaceDefaults — chữ ký material mặc định cho bề mặt procedural (tường + sàn).
 *
 * Nguồn chân lý DUY NHẤT để cả nơi TẠO (WallFactory / RoomSystem) lẫn nơi RESET
 * (surfaceHandlers) dùng chung một giá trị → reset luôn khớp tuyệt đối với material
 * gốc do factory dựng (materialRegistry.get trả về cùng instance theo signature).
 */
import * as THREE from "three";
import type { MaterialSignature } from "src/engine/registries/MaterialRegistry";

/** Material mặc định của thân tường (khớp createWall). */
export const WALL_DEFAULT_MATERIAL: MaterialSignature = {
    color: 0xcccccc,
    metalness: 0,
    roughness: 0.9,
};

/** Material mặc định của sàn phòng (khớp RoomSystem.updateRoomMesh). */
export const FLOOR_DEFAULT_MATERIAL: MaterialSignature = {
    color: 0xe2e8f0,
    metalness: 0.1,
    roughness: 0.9,
    side: THREE.DoubleSide,
};
