/**
 * generateHouse — macro tổng: brief → cả nhà 1 tầng (WP6).
 *
 * Điều phối: planHouse (chia footprint→lưới phòng) → createRoom mỗi phòng → cửa
 * giữa phòng kề + cửa chính → setSurfaceMaterial (palette style) → furnishRoom
 * (recipeToIntents). Cả lượt nằm trong 1 asyncTransaction (AgentClient) → undo 1
 * phát nguyên căn. confirm=false → trả PREVIEW để hỏi user trước thao tác lớn.
 *
 * Best-effort từng bước: 1 bước lỗi (vd cửa) KHÔNG vỡ cả nhà — gom vào notes.
 * Giới hạn M1: 1 tầng. Phòng kề: createRoom tự gộp node trùng vị trí + tái dùng tường
 * cạnh chung → junction đúng, không còn node/tường chồng nhau.
 */
import type { ToolDef } from "src/ai/agent/agentTypes";
import { dispatchCommands, ToolInputError } from "src/ai/tools/dispatchBridge";
import { createRoomTool } from "src/ai/tools/createRoom";
import { addOpeningTool } from "src/ai/tools/addOpening";
import { furnishRoomTool } from "src/ai/tools/furnishRoom";
import { surfaceMaterialCommands } from "src/ai/tools/setSurfaceMaterial";
import { describeScene } from "src/ai/perception/describeScene";
import {
    planHouse, computeAdjacencies, type HouseBrief, type RoomType, type RoomPlan, type Adjacency,
} from "src/ai/planner/housePlanner";
import { getStylePack, pickFloorMaterial, pickWallMaterial, recipeToIntents } from "src/ai/style";

const EPS = 1e-6;
const ROOM_TYPES = new Set<RoomType>(["living", "bedroom", "kitchen", "bathroom", "dining", "study"]);
const INTERIOR_DOOR = "door-a";
const FRONT_DOOR = "door-c";

function parseBrief(input: unknown): { brief: HouseBrief; confirm: boolean } {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    const b = (o.brief ?? o) as Record<string, unknown>;
    if (typeof b.style !== "string") throw new ToolInputError("brief.style phải là string.");
    getStylePack(b.style); // throw nếu style lạ
    if (!Array.isArray(b.rooms) || b.rooms.length === 0) throw new ToolInputError("brief.rooms phải là mảng không rỗng.");
    const rooms = b.rooms.map((r, i) => {
        const rr = r as Record<string, unknown>;
        if (!ROOM_TYPES.has(rr.type as RoomType)) throw new ToolInputError(`rooms[${i}].type không hợp lệ: ${String(rr.type)}.`);
        return {
            type: rr.type as RoomType,
            count: typeof rr.count === "number" && rr.count > 0 ? rr.count : 1,
            areaM2: typeof rr.areaM2 === "number" ? rr.areaM2 : undefined,
        };
    });
    const footprint = b.footprint && typeof b.footprint === "object"
        ? { width: Number((b.footprint as Record<string, unknown>).width), depth: Number((b.footprint as Record<string, unknown>).depth) }
        : undefined;
    return {
        brief: { style: b.style, rooms, totalAreaM2: typeof b.totalAreaM2 === "number" ? b.totalAreaM2 : undefined, footprint },
        // Mặc định DỰNG NGAY (đã có undo 1 phát). Chỉ trả preview khi confirm===false.
        // Lý do: transport stateless-per-message (BackendTransport.start reset turns)
        // → không thể chờ user xác nhận ở message sau (mất ngữ cảnh).
        confirm: o.confirm !== false,
    };
}

/** Wall + t để mở cửa trên cạnh chung, dựa thứ tự wall của createRoom. */
function doorOnEdge(room: RoomPlan & { wallIds: string[] }, adj: Adjacency): { wallId: string; t: number } | null {
    const [x1, z1, x2, z2] = room.rect;
    const w = x2 - x1, h = z2 - z1;
    const M = (adj.span[0] + adj.span[1]) / 2;
    const clamp = (t: number) => Math.max(0.12, Math.min(0.88, t));
    // wallIds: 0=bắc(z1,+x) 1=đông(x2,+z) 2=nam(z2,−x) 3=tây(x1,−z)
    if (adj.axis === "x") {
        if (Math.abs(adj.line - x2) < EPS) return { wallId: room.wallIds[1], t: clamp((M - z1) / h) };
        if (Math.abs(adj.line - x1) < EPS) return { wallId: room.wallIds[3], t: clamp((z2 - M) / h) };
    } else {
        if (Math.abs(adj.line - z1) < EPS) return { wallId: room.wallIds[0], t: clamp((M - x1) / w) };
        if (Math.abs(adj.line - z2) < EPS) return { wallId: room.wallIds[2], t: clamp((x2 - M) / w) };
    }
    return null;
}

/** Tường biên ngoài của phòng (nằm trên mép footprint) để đặt cửa chính. */
function exteriorWall(room: RoomPlan & { wallIds: string[] }, fp: { width: number; depth: number }): string | null {
    const [x1, z1, x2, z2] = room.rect;
    if (Math.abs(z1) < EPS) return room.wallIds[0]; // bắc
    if (Math.abs(x2 - fp.width) < EPS) return room.wallIds[1]; // đông
    if (Math.abs(z2 - fp.depth) < EPS) return room.wallIds[2]; // nam
    if (Math.abs(x1) < EPS) return room.wallIds[3]; // tây
    return null;
}

type Ctx = Parameters<ToolDef["handler"]>[1];
type Created = RoomPlan & { roomKey: string; wallIds: string[] };

export const generateHouseTool: ToolDef = {
    schema: {
        name: "generateHouse",
        description:
            "Dựng & bày & phối màu CẢ NHÀ 1 tầng từ brief. brief={ style, rooms:[{type,count,areaM2?}], " +
            "totalAreaM2?, footprint? }. type ∈ living/bedroom/kitchen/bathroom/dining/study. " +
            "MẶC ĐỊNH dựng ngay (đã có undo 1 phát) — gọi thẳng generateHouse(brief). Chỉ truyền confirm=false " +
            "nếu người dùng RÕ RÀNG muốn xem trước; KHÔNG chờ xác nhận qua tin nhắn sau.",
        input_schema: {
            type: "object",
            properties: {
                brief: {
                    type: "object",
                    properties: {
                        style: { type: "string", description: "khoá phong cách (vd scandinavian)" },
                        rooms: { type: "array", description: "[{type,count,areaM2?}]", items: { type: "object" } },
                        totalAreaM2: { type: "number" },
                        footprint: { type: "object", description: "{width,depth} (mét), optional" },
                    },
                    required: ["style", "rooms"],
                },
                confirm: { type: "boolean", description: "false=preview, true=dựng thật" },
            },
            required: ["brief"],
        },
    },
    handler: async (input, ctx: Ctx) => {
        const { brief, confirm } = parseBrief(input);
        const plan = planHouse(brief);
        const pack = getStylePack(brief.style);

        const roomSummary = plan.rooms.map((r) => ({
            type: r.type,
            areaM2: Math.round((r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) * 10) / 10,
        }));

        if (!confirm) {
            return JSON.stringify({
                ok: true, preview: true, style: pack.label,
                footprint: { width: Math.round(plan.footprint.width * 10) / 10, depth: Math.round(plan.footprint.depth * 10) / 10 },
                rooms: roomSummary,
                message: `Sẽ dựng ${plan.rooms.length} phòng (${roomSummary.map((r) => `${r.type} ${r.areaM2}m²`).join(", ")}) phong cách ${pack.label}. Xác nhận?`,
            });
        }

        if (!ctx.perception) throw new ToolInputError("Không có scene để dựng nhà.");
        const notes: string[] = [];

        // 1) Dựng phòng — thu roomKey + wallIds.
        const created: Created[] = [];
        for (const rp of plan.rooms) {
            const [x1, z1, x2, z2] = rp.rect;
            const res = JSON.parse(await createRoomTool.handler(
                { x: x1, z: z1, width: x2 - x1, depth: z2 - z1, thickness: pack.wallT }, ctx,
            ));
            const nodeIds: string[] = res.room.nodeIds;
            created.push({ ...rp, roomKey: [...nodeIds].sort().join(","), wallIds: res.room.wallIds });
        }

        // 1b) ROOMKEY THẬT: key từ 4 góc createRoom KHÔNG bền — phòng kề chẻ tường nhau
        //     làm RoomDetection thêm node mối nối vào perimeter → key lệch. Re-perceive rồi
        //     map mỗi phòng detected → plan theo centroid-in-rect, ghi đè roomKey bằng key
        //     describeScene THẬT. Mọi bước dưới (type/material/furnish) dùng key này mới
        //     khớp — nếu không, furnishRoom/setFloor tra theo key cũ sẽ trượt (đồ không đặt được).
        const detected = describeScene(ctx.perception).rooms;
        for (const c of created) {
            const [x1, z1, x2, z2] = c.rect;
            const hit = detected.find((d) => d.centroid.x > x1 && d.centroid.x < x2 && d.centroid.z > z1 && d.centroid.z < z2);
            if (hit) c.roomKey = hit.key;
            else notes.push(`phòng ${c.type}: không khớp phòng phát hiện (bỏ qua type/đồ).`);
        }

        // 1c) Gán loại phòng theo roomKey THẬT → describeScene phơi `type` cho lượt sau / UI
        //     phân biệt được khách/bếp/ngủ/WC. Thuần metadata (không mesh), trong cùng
        //     transaction → undo 1 phát cùng cả nhà.
        await dispatchCommands(ctx.api, created.map((c) => ({ type: "SET_ROOM_TYPE", roomKey: c.roomKey, roomType: c.type })));

        // 2) Cửa giữa phòng kề (best-effort). doorWallIds: tránh gắn đồ treo lên tường có cửa.
        let doors = 0;
        const doorWallIds = new Set<string>();
        for (const adj of computeAdjacencies(plan.rooms)) {
            const d = doorOnEdge(created[adj.a], adj);
            if (!d) continue;
            try {
                await addOpeningTool.handler({ modelId: INTERIOR_DOOR, hostWallId: d.wallId, t: d.t }, ctx);
                doors++;
                doorWallIds.add(d.wallId);
            } catch (e) { notes.push(`cửa ${created[adj.a].type}↔${created[adj.b].type}: ${(e as Error).message}`); }
        }
        // 3) Cửa chính trên tường biên của phòng đầu (thường living).
        const front = exteriorWall(created[0], plan.footprint);
        if (front) {
            try { await addOpeningTool.handler({ modelId: FRONT_DOOR, hostWallId: front, t: 0.5 }, ctx); doors++; doorWallIds.add(front); }
            catch (e) { notes.push(`cửa chính: ${(e as Error).message}`); }
        }

        // 4) Material sàn + tường theo palette style (best-effort).
        for (const c of created) {
            try {
                await dispatchCommands(ctx.api, surfaceMaterialCommands({ surface: "floor", roomKey: c.roomKey, materialId: pickFloorMaterial(brief.style, c.type) }));
            } catch (e) { notes.push(`sàn ${c.type}: ${(e as Error).message}`); }
            const wallMat = pickWallMaterial(brief.style, c.type);
            for (const wallId of c.wallIds) {
                try { await dispatchCommands(ctx.api, surfaceMaterialCommands({ surface: "wall", wallId, materialId: wallMat })); }
                catch (e) { notes.push(`tường ${c.type}: ${(e as Error).message}`); break; }
            }
        }

        // 5) Bày đồ mỗi phòng (recipeToIntents → furnishRoom) + gắn đồ treo THẬT (B3).
        let placed = 0, skipped = 0, mountedN = 0;
        for (const c of created) {
            const { intents, mounted, notes: rn } = recipeToIntents(brief.style, c.type);
            for (const n of rn) notes.push(`${c.type}: ${n}`);

            // Đồ treo (kệ/giá khăn — constraint wall) → addOpening lên tường KHÔNG có cửa (B3).
            for (const m of mounted) {
                const hostWall = c.wallIds.find((w) => !doorWallIds.has(w)) ?? c.wallIds[0];
                if (!hostWall) { notes.push(`${c.type}: "${m.role}" không có tường để gắn.`); continue; }
                try { await addOpeningTool.handler({ modelId: m.modelId, hostWallId: hostWall, t: 0.5 }, ctx); mountedN++; }
                catch (e) { notes.push(`${c.type}: gắn "${m.role}": ${(e as Error).message}`); }
            }

            if (intents.length === 0) continue;
            try {
                const out = JSON.parse(await furnishRoomTool.handler({ roomKey: c.roomKey, items: intents }, ctx));
                placed += out.placed?.length ?? 0;
                skipped += out.skipped?.length ?? 0;
            } catch (e) { notes.push(`bày ${c.type}: ${(e as Error).message}`); }
        }

        return JSON.stringify({
            ok: true, style: pack.label,
            rooms: created.map((c) => ({ type: c.type, roomKey: c.roomKey })),
            doors, furnished: { placed, skipped, mounted: mountedN }, notes,
            summary: `Dựng ${created.length} phòng, ${doors} cửa, bày ${placed} món${mountedN ? ` + ${mountedN} đồ treo` : ""}${skipped ? ` (bỏ ${skipped})` : ""}.`,
        });
    },
};
