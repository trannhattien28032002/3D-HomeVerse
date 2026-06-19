/**
 * furnitureLimit — trần số lượng đồ nội thất trong một scene (chống spam).
 *
 * Vì sao có: mỗi món là một entity + GLB instance + body va chạm; cho đặt vô hạn
 * sẽ phình bộ nhớ/giảm FPS (và đặc biệt khi multiselect 500 vật cùng lúc). Đặt một
 * trần mềm để bảo vệ trải nghiệm.
 *
 * Đếm theo {@link FurnitureTag} → bao gồm cả đồ đặt sàn LẪN đồ bám tường (kệ/cửa/cửa
 * sổ) vì cả ba đường spawn trong FurnitureFactory đều gắn FurnitureTag. Một trần duy
 * nhất cho mọi loại décor.
 *
 * Guard được áp ở tầng command (handlePlaceFurniture/handlePlaceWallItem — chốt cứng,
 * chặn cả AI agent) và ở FurniturePlacementSystem.begin (chặn sớm cho UX). KHÔNG áp ở
 * deserialize: nạp lại một scene cũ (kể cả > trần) phải luôn thành công.
 */
import type { World } from "src/engine/ecs/World";
import { Query } from "src/engine/ecs/Query";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";

/** Trần mềm số đồ nội thất mỗi scene. */
export const MAX_FURNITURE_ENTITIES = 500;

/** Số đồ nội thất hiện có trong world (đồ sàn + đồ bám tường). */
export function countFurniture(world: World): number {
    return Query.entitiesWith(world, FurnitureTag).length;
}

/** True khi đã chạm/vượt trần → chặn đặt thêm. */
export function isFurnitureAtLimit(world: World): boolean {
    return countFurniture(world) >= MAX_FURNITURE_ENTITIES;
}
