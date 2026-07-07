/**
 * setSurfaceMaterial — đổi material sàn/tường (WP7-partial).
 *
 * floor → SET_FLOOR_MATERIAL { roomKey } (roomKey = rooms[].key).
 * wall  → SET_WALL_MATERIAL { wallId, face } — mỗi mặt 1 lệnh; mặc định sơn CẢ 2 mặt.
 * Guard materialId qua materials.json (chống bịa). Dùng cho lệnh lẻ ("đổi sàn xanh")
 * và cho generateHouse (áp palette style).
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { WallFace } from "src/engine/components/render/SurfaceMaterial";
import type { ToolDef } from "src/ai/agent/agentTypes";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";
import { getMaterialsRaw, catalogVersion } from "src/shared/catalog/catalogStore";

// Tập materialId hợp lệ suy ra từ catalogStore, memo theo catalogVersion.
let cachedIds: Set<string> | null = null;
let cachedVersion = -1;

function materialIds(): Set<string> {
    const v = catalogVersion();
    if (cachedIds && cachedVersion === v) return cachedIds;
    cachedIds = new Set(getMaterialsRaw().materials.map((m) => m.id));
    cachedVersion = v;
    return cachedIds;
}

/** Có phải materialId thật trong catalog. */
export function isKnownMaterial(id: string): boolean {
    return materialIds().has(id);
}

/** Build command(s) cho 1 surface — pure, dùng chung với generateHouse. */
export function surfaceMaterialCommands(args: {
    surface: "floor" | "wall";
    materialId: string;
    roomKey?: string;
    wallId?: string;
    face?: WallFace | "both";
}): EngineCommand[] {
    if (!isKnownMaterial(args.materialId)) {
        throw new ToolInputError(`materialId không có thật: "${args.materialId}".`);
    }
    if (args.surface === "floor") {
        if (!args.roomKey) throw new ToolInputError("floor cần roomKey.");
        return [{ type: "SET_FLOOR_MATERIAL", roomKey: args.roomKey, materialId: args.materialId }];
    }
    if (!args.wallId) throw new ToolInputError("wall cần wallId.");
    const faces: WallFace[] = args.face === "left" || args.face === "right" ? [args.face] : ["left", "right"];
    return faces.map((face) => ({ type: "SET_WALL_MATERIAL", wallId: args.wallId!, materialId: args.materialId, face }));
}

type Input = { surface: "floor" | "wall"; materialId: string; roomKey?: string; wallId?: string; face?: WallFace | "both" };

function parse(input: unknown): Input {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (o.surface !== "floor" && o.surface !== "wall") throw new ToolInputError('surface phải là "floor" | "wall".');
    if (typeof o.materialId !== "string") throw new ToolInputError("materialId phải là string.");
    if (o.face !== undefined && o.face !== "left" && o.face !== "right" && o.face !== "both") {
        throw new ToolInputError('face phải là "left" | "right" | "both".');
    }
    return {
        surface: o.surface,
        materialId: o.materialId,
        roomKey: typeof o.roomKey === "string" ? o.roomKey : undefined,
        wallId: typeof o.wallId === "string" ? o.wallId : undefined,
        face: o.face as Input["face"],
    };
}

export const setSurfaceMaterialTool: ToolDef = {
    schema: {
        name: "setSurfaceMaterial",
        description:
            "Đổi material sàn hoặc tường. surface='floor' cần roomKey (rooms[].key); surface='wall' cần " +
            "wallId (walls[].wallId), mặc định sơn cả 2 mặt. materialId phải có thật trong catalog material.",
        input_schema: {
            type: "object",
            properties: {
                surface: { type: "string", description: '"floor" | "wall"' },
                materialId: { type: "string", description: "materialId catalog có thật" },
                roomKey: { type: "string", description: "khoá phòng (floor)" },
                wallId: { type: "string", description: "id tường (wall)" },
                face: { type: "string", description: '"left" | "right" | "both" (mặc định both)' },
            },
            required: ["surface", "materialId"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        const commands = surfaceMaterialCommands(p);
        await dispatchCommands(ctx.api, commands);
        return JSON.stringify({ ok: true, applied: { surface: p.surface, materialId: p.materialId, count: commands.length } });
    },
};
