/**
 * describeScene — lớp "mắt" của AI agent (WP0).
 *
 * Biến trạng thái ECS hiện tại thành một JSON gọn, ổn định cho LLM đọc. Thuần
 * chỉ-đọc, không mutate gì — an toàn gọi bất cứ lúc nào.
 *
 * Vì sao KHÔNG dựng trên serializeScene():
 *   - serializeScene() là format LƯU FILE — furniture/wallItem chỉ có toạ độ +
 *     modelId, KHÔNG có entityId. AI cần entityId để sau này tham chiếu món cụ
 *     thể (move/xoá/đổi material) mà không bịa id. Nên ta đọc thẳng ECS world.
 *   - Thông tin phòng (diện tích, tâm, tường bao) không nằm trong SceneDocument.
 *     Ta gọi RoomDetection.findRooms() để có RoomPolygon.nodes THEO THỨ TỰ →
 *     suy ra wallIds bao quanh (RoomGeometry.key đã sort nên mất thứ tự này).
 *
 * Bất biến: AI chỉ đọc summary này; mọi thay đổi vẫn đi qua dispatcher.
 */
import type { EngineInstance } from "src/engine/engineTypes";
import type { Vec2XZ, BBoxXZ } from "src/shared/types/primitives";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Transform } from "src/engine/components/core/Transform";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Query } from "src/engine/ecs/Query";
import { RoomDetection } from "src/engine/graph/RoomDetection";
import { getCatalogItem } from "src/engine/catalog/FurnitureCatalog";

// ── Output shape ───────────────────────────────────────────────────────────────
// Toạ độ sàn dùng Vec2XZ/BBoxXZ (trục XZ) từ shared/types — KHÔNG tự định nghĩa
// Vec2 local nữa (tránh xung đột với Vec2 màn hình {x,y}).

export type RoomSummary = {
    /** Khóa phòng bền = sorted nodeIds join "," (khớp RoomGeometry.key). */
    key: string;
    /** Diện tích m². */
    area: number;
    /** Tâm phòng (polygon centroid) — điểm tham chiếu "giữa phòng". */
    centroid: Vec2XZ;
    /** Hộp bao trục XZ. */
    bbox: BBoxXZ;
    /** wallId các tường bao quanh, theo thứ tự perimeter. */
    wallIds: string[];
};

export type WallSummary = {
    wallId: string;
    from: Vec2XZ;
    to: Vec2XZ;
    /** Chiều dài tim tường (m). */
    length: number;
    thickness: number;
    height: number;
};

export type FurnitureSummary = {
    /** ECS entity id — dùng để tham chiếu món này trong lệnh sau (không bịa). */
    entityId: string;
    modelId: string;
    /** Tên catalog (fallback = modelId nếu không có trong catalog). */
    name: string;
    x: number;
    z: number;
    /** Góc yaw quanh trục Y (radian). */
    rotY: number;
};

export type WallItemSummary = {
    entityId: string;
    modelId: string;
    name: string;
    hostWallId: string;
    /** Vị trí dọc tim tường (0..1). */
    t: number;
    /** Mặt tường (+1/−1). Opening luôn +1. */
    side: number;
};

export type SceneSummary = {
    rooms: RoomSummary[];
    walls: WallSummary[];
    furniture: FurnitureSummary[];
    wallItems: WallItemSummary[];
    /** true khi scene trống hoàn toàn (chưa có tường/đồ/phòng). */
    empty: boolean;
};

/** Tập con của EngineInstance mà describeScene thật sự cần (đọc-only). */
export type ScenePerceptionSource = Pick<EngineInstance, "world" | "nodes" | "wallEntityByWallId">;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Làm tròn về `d` chữ số thập phân để JSON gọn và ổn định (tránh nhiễu float). */
function r(n: number, d = 3): number {
    const f = 10 ** d;
    return Math.round(n * f) / f;
}

/** Tên catalog của model, fallback về chính modelId nếu không tìm thấy. */
function nameOf(modelId: string): string {
    return getCatalogItem(modelId)?.name ?? modelId;
}

/** Khóa cặp node không phụ thuộc hướng (a-b == b-a). */
function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Polygon centroid (công thức area-weighted). Đúng cho cả phòng lõm. Fallback về
 * trung bình đỉnh khi diện tích ~ 0 (đa giác suy biến).
 */
function polygonCentroid(points: Vec2XZ[]): Vec2XZ {
    let twiceArea = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const cross = p1.x * p2.z - p2.x * p1.z;
        twiceArea += cross;
        cx += (p1.x + p2.x) * cross;
        cz += (p1.z + p2.z) * cross;
    }
    if (Math.abs(twiceArea) < 1e-9) {
        // Đa giác suy biến → trung bình đỉnh.
        const n = points.length || 1;
        return {
            x: points.reduce((s, p) => s + p.x, 0) / n,
            z: points.reduce((s, p) => s + p.z, 0) / n,
        };
    }
    const f = twiceArea * 3;
    return { x: cx / f, z: cz / f };
}

function bboxOf(points: Vec2XZ[]): BBoxXZ {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX: r(minX), minZ: r(minZ), maxX: r(maxX), maxZ: r(maxZ) };
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function describeScene(engine: ScenePerceptionSource): SceneSummary {
    const { world, nodes, wallEntityByWallId } = engine;

    // ── Walls + bảng tra cặp-node → wallId (để suy wallIds của phòng) ─────────────
    const walls: WallSummary[] = [];
    const wallByPair = new Map<string, string>();
    for (const [wallId, entityId] of wallEntityByWallId) {
        const wn = world.getComponent(entityId, WallNodes);
        if (!wn) continue; // entity ở trạng thái chuyển tiếp (SPLIT_WALL) — bỏ qua.
        const a = nodes.get(wn.startNodeId);
        const b = nodes.get(wn.endNodeId);
        if (!a || !b) continue;

        wallByPair.set(pairKey(wn.startNodeId, wn.endNodeId), wallId);

        const size = world.getComponent(entityId, WallSize);
        walls.push({
            wallId,
            from: { x: r(a.x), z: r(a.z) },
            to: { x: r(b.x), z: r(b.z) },
            length: r(Math.hypot(b.x - a.x, b.z - a.z)),
            thickness: r(wn.thickness),
            height: r(size?.height ?? 0),
        });
    }

    // ── Rooms (RoomDetection cho nodes theo thứ tự perimeter) ─────────────────────
    const rooms: RoomSummary[] = [];
    for (const room of RoomDetection.findRooms(world, nodes)) {
        const key = [...room.nodes].sort().join(",");
        const centroid = polygonCentroid(room.points);

        const wallIds: string[] = [];
        for (let i = 0; i < room.nodes.length; i++) {
            const w = wallByPair.get(pairKey(room.nodes[i], room.nodes[(i + 1) % room.nodes.length]));
            if (w) wallIds.push(w);
        }

        rooms.push({
            key,
            area: r(room.area, 2),
            centroid: { x: r(centroid.x), z: r(centroid.z) },
            bbox: bboxOf(room.points),
            wallIds,
        });
    }

    // ── Furniture trên sàn (loại đồ bám tường — chúng nằm ở wallItems) ────────────
    const furniture: FurnitureSummary[] = [];
    for (const e of Query.entitiesWith(world, FurnitureTag, Transform)) {
        if (world.hasComponent(e, WallMounted) || world.hasComponent(e, WallOpening)) continue;
        const tag = world.getComponent(e, FurnitureTag)!;
        const t = world.getComponent(e, Transform)!;
        furniture.push({
            entityId: e,
            modelId: tag.modelId,
            name: nameOf(tag.modelId),
            x: r(t.x),
            z: r(t.z),
            rotY: r(t.rotY, 4),
        });
    }

    // ── Wall items (kệ treo + cửa/cửa sổ) ────────────────────────────────────────
    const wallItems: WallItemSummary[] = [];
    for (const e of Query.entitiesWith(world, FurnitureTag, WallMounted)) {
        const tag = world.getComponent(e, FurnitureTag)!;
        const wm = world.getComponent(e, WallMounted)!;
        wallItems.push({
            entityId: e,
            modelId: tag.modelId,
            name: nameOf(tag.modelId),
            hostWallId: wm.hostWallId,
            t: r(wm.t, 4),
            side: wm.side,
        });
    }
    for (const e of Query.entitiesWith(world, FurnitureTag, WallOpening)) {
        const tag = world.getComponent(e, FurnitureTag)!;
        const wo = world.getComponent(e, WallOpening)!;
        wallItems.push({
            entityId: e,
            modelId: tag.modelId,
            name: nameOf(tag.modelId),
            hostWallId: wo.hostWallId,
            t: r(wo.t, 4),
            side: 1,
        });
    }

    const empty = rooms.length === 0 && walls.length === 0 && furniture.length === 0 && wallItems.length === 0;

    return { rooms, walls, furniture, wallItems, empty };
}
