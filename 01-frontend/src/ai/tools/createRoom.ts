/**
 * createRoom — macro tạo phòng chữ nhật kín (WP3).
 *
 * Expand deterministic: 4× ENSURE_NODE (id từ api.nextNodeId) + 4× ADD_WALL
 * (id từ api.nextWallId). (x,z) là góc gốc (min corner); width theo trục X, depth
 * theo trục Z. Cả lượt AI đã nằm trong 1 asyncTransaction (AgentClient) → undo 1 phát.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";

type CreateRoomInput = { x: number; z: number; width: number; depth: number; thickness?: number };

const MIN_SIZE = 0.5;

function parse(input: unknown): CreateRoomInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    for (const k of ["x", "z", "width", "depth"]) {
        if (typeof o[k] !== "number") throw new ToolInputError(`${k} phải là number.`);
    }
    if (o.thickness !== undefined && typeof o.thickness !== "number") throw new ToolInputError("thickness phải là number.");
    const width = o.width as number;
    const depth = o.depth as number;
    if (width < MIN_SIZE || depth < MIN_SIZE) throw new ToolInputError(`width và depth phải ≥ ${MIN_SIZE}m.`);
    return { x: o.x as number, z: o.z as number, width, depth, thickness: o.thickness as number | undefined };
}

export const createRoomTool: ToolDef = {
    schema: {
        name: "createRoom",
        description:
            "Tạo một phòng CHỮ NHẬT kín (4 tường) tại góc gốc (x,z) world-space (mét), " +
            "rộng `width` theo trục X và sâu `depth` theo trục Z. Dùng khi người dùng muốn dựng phòng mới.",
        input_schema: {
            type: "object",
            properties: {
                x: { type: "number", description: "X góc gốc (mét)" },
                z: { type: "number", description: "Z góc gốc (mét)" },
                width: { type: "number", description: "chiều rộng theo X (mét, ≥ 0.5)" },
                depth: { type: "number", description: "chiều sâu theo Z (mét, ≥ 0.5)" },
                thickness: { type: "number", description: "độ dày tường (mét), mặc định 0.15" },
            },
            required: ["x", "z", "width", "depth"],
        },
    },
    handler: async (input, ctx) => {
        const p = parse(input);
        const th = p.thickness ?? 0.15;

        const nodeIds = [ctx.api.nextNodeId(), ctx.api.nextNodeId(), ctx.api.nextNodeId(), ctx.api.nextNodeId()];
        const wallIds = [ctx.api.nextWallId(), ctx.api.nextWallId(), ctx.api.nextWallId(), ctx.api.nextWallId()];

        // 4 góc theo chiều kim đồng hồ trong XZ.
        const corners = [
            { x: p.x, z: p.z },
            { x: p.x + p.width, z: p.z },
            { x: p.x + p.width, z: p.z + p.depth },
            { x: p.x, z: p.z + p.depth },
        ];

        const commands: EngineCommand[] = [];
        for (let i = 0; i < 4; i++) {
            commands.push({ type: "ENSURE_NODE", nodeId: nodeIds[i], x: corners[i].x, z: corners[i].z });
        }
        for (let i = 0; i < 4; i++) {
            commands.push({
                type: "ADD_WALL",
                wallId: wallIds[i],
                startNodeId: nodeIds[i],
                endNodeId: nodeIds[(i + 1) % 4],
                thickness: th,
            });
        }

        await dispatchCommands(ctx.api, commands);
        return JSON.stringify({ ok: true, room: { x: p.x, z: p.z, width: p.width, depth: p.depth, nodeIds, wallIds } });
    },
};
