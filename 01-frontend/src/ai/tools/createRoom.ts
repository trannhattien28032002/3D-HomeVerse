/**
 * createRoom — macro tạo phòng chữ nhật kín (WP3).
 *
 * Expand deterministic: tối đa 4× ENSURE_NODE + 4× ADD_WALL. (x,z) là góc gốc (min
 * corner); width theo trục X, depth theo trục Z. Cả lượt AI đã nằm trong 1
 * asyncTransaction (AgentClient) → undo 1 phát.
 *
 * SNAP TOPOLOGY (phòng san sát) — y hệt editor tay (SelectTool: kéo đầu tường vào
 * node → MERGE_NODE, vào thân tường → SPLIT_WALL). Mỗi góc, trước khi cấp ID mới:
 *   1. Trùng node sẵn có (≤ NODE_MERGE_TOL)  → GỘP: tái dùng node đó (junction).
 *   2. Nằm GIỮA thân tường sẵn có            → CHẺ: SPLIT_WALL tại góc, dùng node mới.
 *   3. Còn lại                                → ENSURE_NODE node mới.
 * Cạnh: nếu 2 node đã có tường nối (cạnh chung) → tái dùng wallId cũ thay vì ADD_WALL.
 *
 * Nhờ vậy phòng kề chia chung node/cạnh → WallGeometrySystem dựng junction (miter +
 * cap) đúng và RoomDetection thấy đủ phòng — thay vì node/tường chồng collinear. Cạnh
 * chung tái dùng wallId THẬT để `wallIds` trả về luôn trỏ tường tồn tại (generateHouse
 * cần để đặt cửa/material). Node-phase dispatch tăng dần: mỗi SPLIT cập nhật registry
 * trước khi xét góc/cạnh kế.
 */
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { ToolDef } from "src/ai/agent/agentTypes";
import type { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";

type CreateRoomInput = { x: number; z: number; width: number; depth: number; thickness?: number };

const MIN_SIZE = 0.5;
/** Ngưỡng snap node/tường (mét). Góc phòng cách ≥ MIN_SIZE nên không bao giờ gộp nhầm 2 góc cùng phòng. */
const NODE_MERGE_TOL = 0.01;

/** Tìm node sẵn có trùng vị trí (trong NODE_MERGE_TOL) để gộp; null nếu không có. */
function findNodeNear(nodes: NodeRegistry, x: number, z: number): string | null {
    for (const n of nodes.all()) {
        if (Math.hypot(n.x - x, n.z - z) <= NODE_MERGE_TOL) return n.id;
    }
    return null;
}

/** Tìm tường đã nối 2 node (cạnh chung) — giao của connectedWallIds; null nếu chưa có. */
function findWallBetween(nodes: NodeRegistry, aId: string, bId: string): string | null {
    const a = nodes.get(aId);
    const b = nodes.get(bId);
    if (!a || !b) return null;
    for (const w of a.connectedWallIds) if (b.connectedWallIds.has(w)) return w;
    return null;
}

/**
 * Tìm tường mà điểm (x,z) rơi vào GIỮA thân (không tính 2 đầu mút — đầu mút là node, đã
 * lo ở findNodeNear). Tái dựng đoạn tường thuần từ topology NodeRegistry (mỗi wallId xuất
 * hiện ở đúng 2 node) — không chạm ECS. Trả wallId để SPLIT_WALL, null nếu không.
 */
function findWallThrough(nodes: NodeRegistry, x: number, z: number): string | null {
    const ends = new Map<string, { x: number; z: number }[]>();
    for (const n of nodes.all()) {
        for (const w of n.connectedWallIds) {
            let arr = ends.get(w);
            if (!arr) { arr = []; ends.set(w, arr); }
            arr.push({ x: n.x, z: n.z });
        }
    }
    for (const [wallId, pts] of ends) {
        if (pts.length !== 2) continue;
        const [a, b] = pts;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-9) continue;
        const t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
        if (t <= 1e-4 || t >= 1 - 1e-4) continue; // gần đầu mút → bỏ (node-merge lo)
        const px = a.x + t * dx, pz = a.z + t * dz;
        if (Math.hypot(x - px, z - pz) <= NODE_MERGE_TOL) return wallId;
    }
    return null;
}

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
        const nodes = ctx.perception?.nodes ?? null;

        // 4 góc theo chiều kim đồng hồ trong XZ.
        const corners = [
            { x: p.x, z: p.z },
            { x: p.x + p.width, z: p.z },
            { x: p.x + p.width, z: p.z + p.depth },
            { x: p.x, z: p.z + p.depth },
        ];

        // ── Góc → nodeId: gộp node sẵn có / chẻ tường / tạo mới. Dispatch TĂNG DẦN vì
        //    SPLIT_WALL đổi topology → góc & cạnh kế phải đọc registry đã cập nhật.
        const nodeIds: string[] = [];
        for (let i = 0; i < 4; i++) {
            const { x, z } = corners[i];
            const merge = nodes ? findNodeNear(nodes, x, z) : null;
            if (merge) { nodeIds.push(merge); continue; }

            const onWall = nodes ? findWallThrough(nodes, x, z) : null;
            if (onWall) {
                const nid = ctx.api.nextNodeId();
                await dispatchCommands(ctx.api, [
                    { type: "SPLIT_WALL", originalWallId: onWall, newWallId: ctx.api.nextWallId(), newNodeId: nid, x, z },
                ]);
                nodeIds.push(nid);
                continue;
            }

            const nid = ctx.api.nextNodeId();
            await dispatchCommands(ctx.api, [{ type: "ENSURE_NODE", nodeId: nid, x, z }]);
            nodeIds.push(nid);
        }

        // ── Cạnh → wallId: tái dùng tường cạnh chung nếu có, ngược lại ADD_WALL.
        const wallIds: string[] = [];
        const wallCmds: EngineCommand[] = [];
        for (let i = 0; i < 4; i++) {
            const a = nodeIds[i], b = nodeIds[(i + 1) % 4];
            const reuse = nodes ? findWallBetween(nodes, a, b) : null;
            if (reuse) {
                wallIds.push(reuse);
            } else {
                const wid = ctx.api.nextWallId();
                wallIds.push(wid);
                wallCmds.push({ type: "ADD_WALL", wallId: wid, startNodeId: a, endNodeId: b, thickness: th });
            }
        }

        await dispatchCommands(ctx.api, wallCmds);
        return JSON.stringify({ ok: true, room: { x: p.x, z: p.z, width: p.width, depth: p.depth, nodeIds, wallIds } });
    },
};
