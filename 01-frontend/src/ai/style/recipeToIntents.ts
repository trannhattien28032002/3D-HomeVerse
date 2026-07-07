/**
 * recipeToIntents — room-recipes-curated[roomType] + style → PlacementIntent[] (WP5 glue).
 *
 * Dịch vocab recipe (against/flank/around/on/counterRun/mounted) sang anchor solver
 * theo giới hạn M1 (AI-HOUSE-GENERATION-EXEC-PLAN §Glue):
 *  - against "wall" → cấp tường cụ thể (xoay north→east→west→south); món đầu = mainWall.
 *  - flank:<role> → 2 góc của mainWall (tủ đầu giường), clearance thấp.
 *  - around:<role> → ghế quanh bàn: đặt gần tâm (đơn giản hoá), ghi note.
 *  - on:<role> → decor trên mặt bàn (cần y-offset) → BỎ ở floor placement, ghi note.
 *  - counterRun → members nối tiếp cùng 1 tường, align tăng dần, clearance 0.
 *  - mounted → trả riêng (route addOpening), KHÔNG vào intents furnishRoom.
 */
import recipesJson from "src/ai/data/room-recipes-curated.json";
import type { Anchor, PlacementIntent } from "src/ai/solver";
import type { RoomType } from "src/ai/style/types";
import { pickModelForRole, type StyleId } from "src/ai/style/styleResolver";

type Placement = {
    against?: string; flank?: string; around?: string; on?: string;
    anchorTo?: string; facing?: unknown; clearance?: number; layout?: string; underlay?: boolean;
};
type Role = {
    role: string; category?: string; filter?: string[]; count?: number | string;
    mounted?: boolean; placement?: Placement;
    members?: { category?: string; filter?: string[] }[];
};
const ROOMS = (recipesJson as { rooms: Record<string, Role[]> }).rooms;

const WALL_ORDER: Anchor[] = ["north-wall", "east-wall", "west-wall", "south-wall"];
const OPPOSITE_WALL: Record<string, Anchor> = {
    "north-wall": "south-wall", "south-wall": "north-wall",
    "east-wall": "west-wall", "west-wall": "east-wall",
};
const FREE_CORNERS: Anchor[] = ["corner-se", "corner-sw", "corner-ne", "corner-nw"];
const CORNERS_OF: Record<string, Anchor[]> = {
    "north-wall": ["corner-nw", "corner-ne"],
    "south-wall": ["corner-sw", "corner-se"],
    "west-wall": ["corner-nw", "corner-sw"],
    "east-wall": ["corner-ne", "corner-se"],
};

function resolveCount(c: number | string | undefined): number {
    if (typeof c === "number") return c;
    if (c === "perChairAroundTable") return 4;
    return 1;
}

function validFacing(f: unknown): PlacementIntent["facing"] {
    if (typeof f === "number" || f === "into-room" || f === "to-wall") return f;
    return undefined;
}

export type RecipeResult = {
    intents: PlacementIntent[];
    /** Đồ bám tường → planner route sang addOpening. */
    mounted: { role: string; modelId: string }[];
    notes: string[];
};

export function recipeToIntents(style: StyleId, roomType: RoomType): RecipeResult {
    const roles = ROOMS[roomType];
    const intents: PlacementIntent[] = [];
    const mounted: { role: string; modelId: string }[] = [];
    const notes: string[] = [];
    if (!roles) { notes.push(`Không có recipe cho phòng "${roomType}".`); return { intents, mounted, notes }; }

    let wallIdx = 0, cornerIdx = 0;
    let mainWall: Anchor | null = null;
    const nextWall = (): Anchor => {
        const w = WALL_ORDER[wallIdx++ % WALL_ORDER.length];
        if (!mainWall) mainWall = w;
        return w;
    };
    const nextCorner = (): Anchor => FREE_CORNERS[cornerIdx++ % FREE_CORNERS.length];
    /** role.role → modelId đã chọn — cho neo tương đối (around/anchorTo tham chiếu THEO role). */
    const modelByRole = new Map<string, string>();

    for (const role of roles) {
        const pl = role.placement ?? {};
        const model = pickModelForRole(style, role.members ? undefined : role.category, { filter: role.filter });

        // counterRun: dãy thiết bị nối tiếp cùng 1 tường.
        if (role.members?.length) {
            const wall = nextWall();
            const n = role.members.length;
            role.members.forEach((m, i) => {
                const id = pickModelForRole(style, m.category, { filter: m.filter });
                if (!id) { notes.push(`counterRun: không có model cho ${m.filter?.join("/") ?? m.category}`); return; }
                const align = n > 1 ? 0.15 + (i * 0.7) / (n - 1) : 0.5;
                intents.push({ modelId: id, against: wall, align, clearance: 0 });
            });
            continue;
        }

        if (!model) { notes.push(`Không có model cho role "${role.role}" (${role.category ?? role.filter?.join("/")})`); continue; }

        if (role.mounted) { mounted.push({ role: role.role, modelId: model }); continue; }

        if (pl.on) { notes.push(`"${role.role}" đặt trên mặt ${pl.on} (cần y-offset) — bỏ ở M1.`); continue; }

        modelByRole.set(role.role, model);

        const count = resolveCount(role.count);
        const clearance = pl.clearance;
        const facing = validFacing(pl.facing);
        // B3: thảm = lớp underlay (nằm dưới đồ) thay vì bỏ hẳn.
        const layer = pl.underlay ? ("underlay" as const) : undefined;

        // B1 — around:<role>: vây 4 cạnh ref (ghế quanh bàn). clearance 0 để tuck sát.
        if (pl.around) {
            const ref = modelByRole.get(pl.around);
            if (ref) {
                for (let i = 0; i < count; i++) intents.push({ modelId: model, anchorTo: ref, relation: "around", clearance: clearance ?? 0, layer });
            } else {
                notes.push(`"${role.role}" quanh ${pl.around}: chưa có ref đã đặt → đặt gần tâm.`);
                for (let i = 0; i < count; i++) intents.push({ modelId: model, against: "center", clearance, facing, layer });
            }
            continue;
        }

        // B2 — anchorTo:<role>: đặt NGAY TRƯỚC ref (bàn trà trước sofa, ghế sát desk, thảm trước giường).
        if (pl.anchorTo) {
            const ref = modelByRole.get(pl.anchorTo);
            if (ref) {
                intents.push({ modelId: model, anchorTo: ref, relation: "front", clearance, facing, layer });
            } else {
                notes.push(`"${role.role}" theo ${pl.anchorTo}: chưa có ref đã đặt → đặt gần tâm.`);
                intents.push({ modelId: model, against: "center", clearance, facing, layer });
            }
            continue;
        }

        // Neo TUYỆT ĐỐI: flank / center / corner / wall.
        const slots: { against: Anchor; align?: number }[] = [];
        if (pl.flank) {
            const pair = CORNERS_OF[mainWall ?? "north-wall"];
            for (let i = 0; i < count; i++) slots.push({ against: pair[i % pair.length] });
        } else if (typeof pl.against === "string" && pl.against.startsWith("wall-opposite:")) {
            // "wall-opposite:sofa" → tường ĐỐI DIỆN tường món chính (TV đối diện sofa).
            slots.push({ against: OPPOSITE_WALL[mainWall ?? "north-wall"] });
        } else if (pl.against === "center") {
            slots.push({ against: "center" });
        } else if (pl.against === "corner") {
            for (let i = 0; i < count; i++) slots.push({ against: nextCorner() });
        } else if (pl.against) {
            // "wall" hoặc "wall-opposite:*" → 1 tường; count>1 thì trải align.
            const wall = nextWall();
            for (let i = 0; i < count; i++) {
                const align = count > 1 ? 0.2 + (i * 0.6) / (count - 1) : undefined;
                slots.push({ against: wall, align });
            }
        } else {
            for (let i = 0; i < count; i++) slots.push({ against: "center" });
        }

        for (const s of slots) {
            intents.push({ modelId: model, against: s.against, align: s.align, clearance, facing, layer });
        }
    }

    return { intents, mounted, notes };
}
