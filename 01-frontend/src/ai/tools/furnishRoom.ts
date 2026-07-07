/**
 * furnishRoom — macro bày nhiều món vào 1 phòng qua layout solver (WP3 nợ → WP4).
 *
 * AI cung cấp Ý ĐỊNH (modelId + anchor/clearance/facing); solver tính toạ độ
 * không-chồng / trong phòng / chừa lối; tool dispatch placed[] thành PLACE_FURNITURE
 * (một transaction do AgentClient bọc). skipped[] trả về agent để tự xử.
 *
 * ⚠️ PLACE_FURNITURE không check va chạm ở engine → solver là lưới an toàn DUY NHẤT.
 * Giới hạn M1: phòng coi như bbox chữ nhật; chỉ đồ đặt sàn (constraint floor).
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import type { Anchor, PlacementIntent, Obstacle, SolverRoom } from "src/ai/solver";
import { solveLayout, footprintRect, inflate } from "src/ai/solver";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";
import { describeScene } from "src/ai/perception/describeScene";
import type { WallSummary } from "src/ai/perception/describeScene";
import { getFootprint2D, getPlacement } from "src/engine/catalog/FurnitureCatalog";

const ANCHORS = new Set<Anchor>([
    "north-wall", "south-wall", "east-wall", "west-wall", "center",
    "corner-nw", "corner-ne", "corner-sw", "corner-se",
]);
/** Khoảng cách tối thiểu new-item ↔ furniture đã có (m). */
const EXISTING_GAP = 0.3;
/** Bán kính vùng chừa trước cửa (m) — đồ không được đè để còn lối ra/vào. */
const DOOR_CLEAR = 0.55;

/**
 * Obstacle vùng-chừa-cửa (B4): mỗi opening (cửa, KHÔNG tính kệ/TV treo) trên tường bao
 * phòng → 1 ô vuông cạnh 2·DOOR_CLEAR tại điểm cửa trên tim tường. Solver né → đồ không
 * chắn cửa, và đồ áp tường tự trượt khỏi mép cửa (gộp luôn lợi ích B5 thực tế).
 */
function openingObstacles(scene: { walls: WallSummary[]; wallItems: { modelId: string; hostWallId: string; t: number }[] }, roomWallIds: string[]): Obstacle[] {
    const wallById = new Map(scene.walls.map((w) => [w.wallId, w]));
    const out: Obstacle[] = [];
    for (const wi of scene.wallItems) {
        if (!roomWallIds.includes(wi.hostWallId)) continue;
        if (getPlacement(wi.modelId).behavior !== "opening") continue; // chỉ cửa/cửa sổ, bỏ kệ/TV treo
        const w = wallById.get(wi.hostWallId);
        if (!w) continue;
        const px = w.from.x + (w.to.x - w.from.x) * wi.t;
        const pz = w.from.z + (w.to.z - w.from.z) * wi.t;
        out.push({
            rect: { minX: px - DOOR_CLEAR, minZ: pz - DOOR_CLEAR, maxX: px + DOOR_CLEAR, maxZ: pz + DOOR_CLEAR },
            kind: "opening-clearance",
        });
    }
    return out;
}

type ItemInput = PlacementIntent;
type FurnishInput = { roomKey: string; items: ItemInput[] };

function parseItem(raw: unknown, i: number): ItemInput {
    if (!raw || typeof raw !== "object") throw new ToolInputError(`items[${i}] phải là object.`);
    const o = raw as Record<string, unknown>;
    if (typeof o.modelId !== "string") throw new ToolInputError(`items[${i}].modelId phải là string.`);
    if (o.against !== undefined && !ANCHORS.has(o.against as Anchor)) {
        throw new ToolInputError(`items[${i}].against không hợp lệ: ${String(o.against)}.`);
    }
    if (o.clearance !== undefined && typeof o.clearance !== "number") throw new ToolInputError(`items[${i}].clearance phải là number.`);
    if (o.align !== undefined && typeof o.align !== "number") throw new ToolInputError(`items[${i}].align phải là number.`);
    if (o.facing !== undefined && typeof o.facing !== "number" && o.facing !== "into-room" && o.facing !== "to-wall") {
        throw new ToolInputError(`items[${i}].facing phải là "into-room" | "to-wall" | number.`);
    }
    return {
        modelId: o.modelId,
        against: o.against as Anchor | undefined,
        clearance: o.clearance as number | undefined,
        align: o.align as number | undefined,
        facing: o.facing as ItemInput["facing"],
    };
}

function parse(input: unknown): FurnishInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (typeof o.roomKey !== "string") throw new ToolInputError("roomKey phải là string (từ scene rooms[].key).");
    if (!Array.isArray(o.items) || o.items.length === 0) throw new ToolInputError("items phải là mảng không rỗng.");
    return { roomKey: o.roomKey, items: o.items.map(parseItem) };
}

export const furnishRoomTool: ToolDef = {
    schema: {
        name: "furnishRoom",
        description:
            "Bày nhiều món nội thất vào MỘT phòng. roomKey lấy từ scene (rooms[].key). " +
            "Mỗi item nêu Ý ĐỊNH, KHÔNG nêu toạ độ: { modelId, against, clearance?, facing?, align? }. " +
            "against ∈ north/south/east/west-wall | center | corner-nw/ne/sw/se. Hệ tự tính toạ độ " +
            "không chồng, trong phòng, chừa lối đi. Chỉ đồ đặt sàn. Trả placed[] + skipped[].",
        input_schema: {
            type: "object",
            properties: {
                roomKey: { type: "string", description: "khoá phòng từ scene rooms[].key" },
                items: {
                    type: "array",
                    description: "danh sách ý định đặt đồ",
                    items: {
                        type: "object",
                        properties: {
                            modelId: { type: "string", description: "modelId catalog có thật (đồ sàn)" },
                            against: { type: "string", description: "neo: north/south/east/west-wall | center | corner-*" },
                            clearance: { type: "number", description: "lối đi tối thiểu quanh món (m), mặc định 0.6" },
                            facing: { description: '"into-room" | "to-wall" | số rotY (radian)' },
                            align: { type: "number", description: "vị trí dọc tường 0..1 (mặc định 0.5)" },
                        },
                        required: ["modelId"],
                    },
                },
            },
            required: ["roomKey", "items"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        if (!ctx.perception) throw new ToolInputError("Không có scene để bày đồ.");

        const scene = describeScene(ctx.perception);
        const room = scene.rooms.find((r) => r.key === p.roomKey);
        if (!room) throw new ToolInputError(`Không tìm thấy phòng "${p.roomKey}".`);

        // wallThickness = dày nhất trong các tường bao phòng (fallback 0.12).
        const roomWalls = scene.walls.filter((w) => room.wallIds.includes(w.wallId));
        const wallThickness = roomWalls.reduce((m, w) => Math.max(m, w.thickness), 0) || 0.12;

        const { minX, minZ, maxX, maxZ } = room.bbox;
        const solverRoom: SolverRoom = {
            bbox: room.bbox,
            points: [
                { x: minX, z: minZ }, { x: maxX, z: minZ },
                { x: maxX, z: maxZ }, { x: minX, z: maxZ },
            ],
            centroid: room.centroid,
            wallThickness,
        };

        // Tách đồ sàn (solver xử) khỏi đồ bám tường (reject — dùng addOpening).
        const skipped: { modelId: string; reason: string }[] = [];
        const intents: PlacementIntent[] = [];
        for (const it of p.items) {
            if (getPlacement(it.modelId).constraint !== "floor") {
                skipped.push({ modelId: it.modelId, reason: "đồ bám tường — dùng addOpening, không phải furnishRoom" });
                continue;
            }
            intents.push(it);
        }

        // Obstacle = furniture đã có (nới EXISTING_GAP) + vùng chừa trước cửa của phòng (B4).
        const existing: Obstacle[] = scene.furniture.map((f) => ({
            rect: inflate(footprintRect(f.x, f.z, f.rotY, getFootprint2D(f.modelId)), EXISTING_GAP),
            kind: "furniture" as const,
        }));
        existing.push(...openingObstacles(scene, room.wallIds));

        const result = solveLayout(solverRoom, intents, { getFootprint: getFootprint2D, existing });
        skipped.push(...result.skipped);

        const commands: EngineCommand[] = result.placed.map((pl) => ({
            type: "PLACE_FURNITURE",
            modelId: pl.modelId,
            x: pl.x,
            z: pl.z,
            rotY: pl.rotY,
        }));
        if (commands.length > 0) await dispatchCommands(ctx.api, commands);

        return JSON.stringify({
            ok: true,
            placed: result.placed,
            skipped,
            summary: `Đặt ${result.placed.length}/${p.items.length} món` + (skipped.length ? `, bỏ ${skipped.length}.` : "."),
        });
    },
};
