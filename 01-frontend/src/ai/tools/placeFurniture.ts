/**
 * placeFurniture — macro tool tối giản (WP1). Đặt 1 món đứng sàn tại (x,z).
 *
 * WP1 chưa có solver: LLM tự chọn toạ độ từ scene context (vd centroid phòng).
 * WP4 sẽ thay phần tính toạ độ bằng layoutSolver; chữ ký tool giữ nguyên ý định.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import { assertConstraint, dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";

type PlaceFurnitureInput = { modelId: string; x: number; z: number; rotY?: number };

function parse(input: unknown): PlaceFurnitureInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (typeof o.modelId !== "string") throw new ToolInputError("modelId phải là string.");
    if (typeof o.x !== "number" || typeof o.z !== "number") throw new ToolInputError("x và z phải là number.");
    if (o.rotY !== undefined && typeof o.rotY !== "number") throw new ToolInputError("rotY phải là number.");
    return { modelId: o.modelId, x: o.x, z: o.z, rotY: o.rotY };
}

export const placeFurnitureTool: ToolDef = {
    schema: {
        name: "placeFurniture",
        description:
            "Đặt một món nội thất đứng sàn vào scene tại toạ độ world-space (đơn vị mét). " +
            "CHỈ dùng modelId có thật xuất hiện trong scene context hoặc catalog. " +
            "rotY là góc yaw quanh trục Y (radian), mặc định 0.",
        input_schema: {
            type: "object",
            properties: {
                modelId: { type: "string", description: "modelId catalog có thật" },
                x: { type: "number", description: "toạ độ X world-space (mét)" },
                z: { type: "number", description: "toạ độ Z world-space (mét)" },
                rotY: { type: "number", description: "góc yaw quanh trục Y (radian), optional" },
            },
            required: ["modelId", "x", "z"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        assertConstraint(p.modelId, "floor");
        const rotY = p.rotY ?? 0;
        const commands: EngineCommand[] = [
            { type: "PLACE_FURNITURE", modelId: p.modelId, x: p.x, z: p.z, rotY },
        ];
        await dispatchCommands(ctx.api, commands);
        return JSON.stringify({ ok: true, placed: { modelId: p.modelId, x: p.x, z: p.z, rotY } });
    },
};
