/**
 * addOpening — macro đặt đồ bám tường: cửa, cửa sổ, kệ treo (WP3).
 *
 * Expand: PLACE_WALL_ITEM(modelId, hostWallId, t, side). modelId phải là đồ
 * constraint "wall" (guard). hostWallId lấy từ scene (describeScene.walls[].wallId).
 * t = vị trí dọc tim tường 0..1. side mặc định +1 (opening luôn +1).
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import { assertConstraint, dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";

type AddOpeningInput = { modelId: string; hostWallId: string; t: number; side?: number };

function parse(input: unknown): AddOpeningInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (typeof o.modelId !== "string") throw new ToolInputError("modelId phải là string.");
    if (typeof o.hostWallId !== "string") throw new ToolInputError("hostWallId phải là string.");
    if (typeof o.t !== "number") throw new ToolInputError("t phải là number (0..1).");
    if (o.side !== undefined && o.side !== 1 && o.side !== -1) throw new ToolInputError("side phải là 1 hoặc -1.");
    return { modelId: o.modelId, hostWallId: o.hostWallId, t: o.t, side: o.side as number | undefined };
}

export const addOpeningTool: ToolDef = {
    schema: {
        name: "addOpening",
        description:
            "Đặt đồ bám tường (cửa, cửa sổ, kệ treo) lên một bức tường. Trước tiên dùng " +
            "searchCatalog(kind='wall') để lấy modelId; lấy hostWallId từ scene (walls[].wallId). " +
            "t là vị trí dọc tim tường (0=đầu, 0.5=giữa, 1=cuối).",
        input_schema: {
            type: "object",
            properties: {
                modelId: { type: "string", description: "modelId đồ bám tường (constraint wall) có thật" },
                hostWallId: { type: "string", description: "wallId của tường (từ scene)" },
                t: { type: "number", description: "vị trí dọc tim tường 0..1" },
                side: { type: "number", enum: [1, -1], description: "mặt tường (mặc định 1)" },
            },
            required: ["modelId", "hostWallId", "t"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        assertConstraint(p.modelId, "wall");

        // Kiểm tra tường tồn tại (nếu có perception).
        if (ctx.perception && !ctx.perception.wallEntityByWallId.has(p.hostWallId)) {
            throw new ToolInputError(`Tường "${p.hostWallId}" không tồn tại trong scene.`);
        }

        const t = Math.min(1, Math.max(0, p.t));
        const commands: EngineCommand[] = [
            { type: "PLACE_WALL_ITEM", modelId: p.modelId, hostWallId: p.hostWallId, t, side: p.side ?? 1 },
        ];
        await dispatchCommands(ctx.api, commands);
        return JSON.stringify({ ok: true, opening: { modelId: p.modelId, hostWallId: p.hostWallId, t, side: p.side ?? 1 } });
    },
};
