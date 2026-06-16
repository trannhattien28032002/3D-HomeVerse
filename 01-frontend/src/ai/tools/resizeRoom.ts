/**
 * resizeRoom — macro đổi kích thước phòng chữ nhật (WP3).
 *
 * Expand: 1× MOVE_NODES (atomic). Đọc phòng từ engine (RoomDetection) theo roomKey,
 * giữ góc gốc (min corner) cố định, dời các node ở cạnh max sang kích thước mới.
 * MOVE_NODES tự reconcile item bám tường (cửa/kệ giữ đứng yên) — kế thừa từ engine.
 *
 * Giới hạn có chủ đích: chỉ phòng CHỮ NHẬT trục XZ (4 node). Phòng lõm/xoay → từ chối
 * rõ ràng (an toàn hơn đoán sai topology).
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";
import { RoomDetection } from "src/engine/graph/RoomDetection";

type ResizeRoomInput = { roomKey: string; width?: number; depth?: number };

const EPS = 1e-4;
const MIN_SIZE = 0.5;
const approx = (a: number, b: number) => Math.abs(a - b) < EPS;

function parse(input: unknown): ResizeRoomInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (typeof o.roomKey !== "string") throw new ToolInputError("roomKey phải là string (lấy từ scene rooms[].key).");
    if (o.width !== undefined && typeof o.width !== "number") throw new ToolInputError("width phải là number.");
    if (o.depth !== undefined && typeof o.depth !== "number") throw new ToolInputError("depth phải là number.");
    if (o.width === undefined && o.depth === undefined) throw new ToolInputError("cần ít nhất width hoặc depth.");
    return { roomKey: o.roomKey, width: o.width as number | undefined, depth: o.depth as number | undefined };
}

export const resizeRoomTool: ToolDef = {
    schema: {
        name: "resizeRoom",
        description:
            "Đổi kích thước một phòng CHỮ NHẬT. roomKey lấy từ scene (rooms[].key). " +
            "Cho width và/hoặc depth (mét). Giữ góc gốc cố định, nới cạnh đối diện. " +
            "Cửa/kệ trên tường được giữ đúng vị trí tự động.",
        input_schema: {
            type: "object",
            properties: {
                roomKey: { type: "string", description: "khoá phòng từ scene rooms[].key" },
                width: { type: "number", description: "chiều rộng mới theo X (mét, ≥ 0.5)" },
                depth: { type: "number", description: "chiều sâu mới theo Z (mét, ≥ 0.5)" },
            },
            required: ["roomKey"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        if (!ctx.perception) throw new ToolInputError("Không có scene để resize.");

        const { world, nodes } = ctx.perception;
        const room = RoomDetection.findRooms(world, nodes).find(
            (r) => [...r.nodes].sort().join(",") === p.roomKey
        );
        if (!room) throw new ToolInputError(`Không tìm thấy phòng "${p.roomKey}".`);
        if (room.nodes.length !== 4) throw new ToolInputError("Chỉ resize được phòng chữ nhật 4 góc.");

        const xs = room.points.map((pt) => pt.x);
        const zs = room.points.map((pt) => pt.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);

        const axisAligned = room.points.every(
            (pt) => (approx(pt.x, minX) || approx(pt.x, maxX)) && (approx(pt.z, minZ) || approx(pt.z, maxZ))
        );
        if (!axisAligned) throw new ToolInputError("Chỉ resize được phòng chữ nhật trục XZ (không xoay/lõm).");

        const newW = p.width ?? maxX - minX;
        const newD = p.depth ?? maxZ - minZ;
        if (newW < MIN_SIZE || newD < MIN_SIZE) throw new ToolInputError(`width và depth phải ≥ ${MIN_SIZE}m.`);
        const newMaxX = minX + newW;
        const newMaxZ = minZ + newD;

        const moves: { nodeId: string; x: number; z: number }[] = [];
        for (let i = 0; i < room.nodes.length; i++) {
            const pt = room.points[i];
            const nx = approx(pt.x, maxX) ? newMaxX : minX;
            const nz = approx(pt.z, maxZ) ? newMaxZ : minZ;
            if (!approx(nx, pt.x) || !approx(nz, pt.z)) moves.push({ nodeId: room.nodes[i], x: nx, z: nz });
        }

        if (moves.length === 0) {
            return JSON.stringify({ ok: true, note: "Kích thước không đổi.", room: { roomKey: p.roomKey, width: newW, depth: newD } });
        }

        const commands: EngineCommand[] = [{ type: "MOVE_NODES", moves }];
        await dispatchCommands(ctx.api, commands);
        return JSON.stringify({ ok: true, room: { roomKey: p.roomKey, width: newW, depth: newD } });
    },
};
