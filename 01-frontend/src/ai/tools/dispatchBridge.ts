/**
 * dispatchBridge — cầu nối DUY NHẤT từ tool AI xuống engine dispatcher.
 *
 * Bất biến: AI không chạm ECS/Three.js/toạ độ thô. Tool chỉ sinh EngineCommand[]
 * rồi đẩy qua đây. Mọi đảm bảo (collision, reconcile, undo) kế thừa miễn phí từ
 * dispatcher.
 *
 * Vì sao KHÔNG mở transaction ở đây: AgentClient bọc TOÀN BỘ lượt AI trong 1
 * asyncTransaction để "undo 1 phát" xoá sạch mọi thay đổi (kể cả nhiều tool-call).
 * Bridge chỉ là executor thuần. `dispatchAsync` xử lý cả lệnh sync lẫn async
 * (PLACE_FURNITURE/PLACE_WALL_ITEM) — xem dispatcher.ts.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { EngineApi } from "src/app/hooks/useEngineApi";
import { getCatalogItem, getPlacement } from "src/engine/catalog/FurnitureCatalog";

/** Lỗi do tool sinh dữ liệu không hợp lệ (modelId bịa, tham số sai kiểu...). */
export class ToolInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ToolInputError";
    }
}

/**
 * Guard chống hallucinate: modelId phải tồn tại trong catalog TRƯỚC khi dispatch.
 * Ném ToolInputError (registry bắt → trả về LLM dạng tool_result để tự sửa).
 */
export function assertKnownModel(modelId: string): void {
    if (!getCatalogItem(modelId)) {
        throw new ToolInputError(`modelId "${modelId}" không tồn tại trong catalog.`);
    }
}

/**
 * Guard ràng buộc đặt: modelId phải tồn tại VÀ đúng kiểu đặt (floor/wall). Tránh
 * dùng nhầm cửa (wall) cho placeFurniture (floor) và ngược lại.
 */
export function assertConstraint(modelId: string, expected: "floor" | "wall"): void {
    assertKnownModel(modelId);
    const c = getPlacement(modelId).constraint;
    if (c !== expected) {
        throw new ToolInputError(
            `modelId "${modelId}" là đồ ${c === "wall" ? "bám tường" : "đặt sàn"}, không dùng cho thao tác ${expected === "wall" ? "bám tường" : "đặt sàn"} này.`
        );
    }
}

/**
 * Chạy danh sách EngineCommand tuần tự qua engine. Caller (AgentClient) chịu
 * trách nhiệm mở/đóng transaction bao quanh.
 */
export async function dispatchCommands(api: EngineApi, commands: EngineCommand[]): Promise<void> {
    for (const cmd of commands) {
        await api.dispatchAsync(cmd);
    }
}
