/**
 * roomMetaHandlers — metadata phòng KHÔNG có mesh (chỉ ghi registry).
 *
 * SET_ROOM_TYPE: ghi registry roomKey→roomType. Khác surfaceHandlers ở chỗ không
 * đụng mesh/material — phòng không có "hình" cho loại; describeScene đọc lại registry
 * để phơi `type` cho AI/UI. Lưu/khôi phục qua serialize giống floorMaterials.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

type SetRoomTypeCmd = Extract<EngineCommand, { type: "SET_ROOM_TYPE" }>;

export function handleSetRoomType(command: SetRoomTypeCmd, deps: DispatcherDeps): void {
    deps.roomTypes.set(command.roomKey, command.roomType);
}
