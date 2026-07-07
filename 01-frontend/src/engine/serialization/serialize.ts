/**
 * serializeScene — đọc trạng thái ECS hiện tại và tạo ra một SceneDocument.
 *
 * Nguồn dữ liệu:
 *  - engine.nodes (NodeRegistry)  → vị trí node
 *  - engine.wallEntityByWallId     → ánh xạ wallId → entity
 *  - engine.world                  → component WallNodes + WallSize của mỗi entity
 *
 * Không mutate gì trong engine — đây là thao tác chỉ-đọc thuần tuý.
 *
 * Tường mà entity thiếu WallNodes hoặc WallSize sẽ bị bỏ qua âm thầm (chúng đang
 * ở trạng thái chuyển tiếp, chưa commit đầy đủ vào ECS).
 */

import type { EngineInstance } from "src/engine/engineTypes";
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallSize } from "src/engine/components/wall/WallSize";
import { SurfaceMaterial } from "src/engine/components/render/SurfaceMaterial";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Model3D } from "src/engine/components/render/Model3D";
import { Transform } from "src/engine/components/core/Transform";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { Query } from "src/engine/ecs/Query";
import type { SceneDocument, SceneNodeRecord, SceneWallRecord, SceneFurnitureRecord, SceneWallItemRecord } from "src/shared/types/SceneDocument";

/**
 * Đọc material đã chọn từ Model3D.materialOverrides → record { slotId: materialId }.
 * Trả về undefined nếu entity không có override nào (giữ file gọn, tương thích ngược).
 */
function readMaterials(engine: EngineInstance, entity: string): Record<string, string> | undefined {
    const model = engine.world.getComponent(entity, Model3D);
    const ov = model?.materialOverrides;
    if (!ov || ov.size === 0) return undefined;
    const out: Record<string, string> = {};
    for (const [slotId, o] of ov) {
        if (o.variantId) out[slotId] = o.variantId;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export function serializeScene(engine: EngineInstance): SceneDocument {
    // ── Nodes ─────────────────────────────────────────────────────────────────
    // Duyệt mọi node trong registry. connectedWallIds là dẫn xuất — không lưu.
    const nodes: SceneNodeRecord[] = [];
    for (const n of engine.nodes.all()) {
        nodes.push({ id: n.id, x: n.x, z: n.z });
    }

    // ── Walls ─────────────────────────────────────────────────────────────────
    // wallEntityByWallId là ánh xạ wall→entity chuẩn (authoritative).
    const walls: SceneWallRecord[] = [];
    for (const [wallId, entityId] of engine.wallEntityByWallId) {
        const wn = engine.world.getComponent(entityId, WallNodes);
        const size = engine.world.getComponent(entityId, WallSize);

        // Bỏ qua entity chưa được gắn đủ component.
        // Xảy ra tạm thời trong chuỗi SPLIT_WALL.
        if (!wn || !size) {
            console.warn(`[serialize] Wall ${wallId} (entity ${entityId}) missing components — skipped.`);
            continue;
        }

        const surf = engine.world.getComponent(entityId, SurfaceMaterial);
        walls.push({
            wallId,
            startNodeId: wn.startNodeId,
            endNodeId: wn.endNodeId,
            thickness: wn.thickness, // WallNodes là chủ duy nhất; WallSize không còn lưu thickness
            height: size.height,
            ...(surf && !surf.isEmpty() && { materialFaces: { ...surf.faces } }),
        });
    }

    // ── Furniture (đồ trên sàn) ─────────────────────────────────────────────────
    // Loại trừ đồ bám tường — chúng lưu riêng ở wallItems theo topology (hostWallId, t).
    const furniture: SceneFurnitureRecord[] = [];
    for (const e of Query.entitiesWith(engine.world, FurnitureTag, Transform)) {
        if (engine.world.hasComponent(e, WallMounted) || engine.world.hasComponent(e, WallOpening)) continue;
        const tag = engine.world.getComponent(e, FurnitureTag)!;
        const t = engine.world.getComponent(e, Transform)!;
        const materials = readMaterials(engine, e);
        furniture.push({ modelId: tag.modelId, x: t.x, y: t.y, z: t.z, rotY: t.rotY, ...(materials && { materials }) });
    }

    // ── Wall items (kệ treo, cửa, cửa sổ) ───────────────────────────────────────
    const wallItems: SceneWallItemRecord[] = [];
    for (const e of Query.entitiesWith(engine.world, FurnitureTag, WallMounted)) {
        const tag = engine.world.getComponent(e, FurnitureTag)!;
        const wm = engine.world.getComponent(e, WallMounted)!;
        const materials = readMaterials(engine, e);
        wallItems.push({ modelId: tag.modelId, hostWallId: wm.hostWallId, t: wm.t, side: wm.side, ...(materials && { materials }) });
    }
    for (const e of Query.entitiesWith(engine.world, FurnitureTag, WallOpening)) {
        const tag = engine.world.getComponent(e, FurnitureTag)!;
        const wo = engine.world.getComponent(e, WallOpening)!;
        const materials = readMaterials(engine, e);
        // wo.side lật model 180° (cửa/cửa sổ xoay mặt). Trước đây hardcode 1 → mất
        // hướng xoay khi nạp lại. Lưu đúng wo.side để giữ rotation qua save/reload.
        wallItems.push({ modelId: tag.modelId, hostWallId: wo.hostWallId, t: wo.t, side: wo.side, ...(materials && { materials }) });
    }

    // ── Sàn (floor materials theo roomKey) ──────────────────────────────────────
    // Registry roomKey→materialId là chủ; chỉ lưu khi có ít nhất 1 entry.
    let floors: Record<string, string> | undefined;
    if (engine.floorMaterials.size > 0) {
        floors = {};
        for (const [key, materialId] of engine.floorMaterials) floors[key] = materialId;
    }

    // ── Loại phòng theo roomKey ─────────────────────────────────────────────────
    // Registry roomKey→roomType là chủ; chỉ lưu khi có ít nhất 1 entry.
    let roomTypes: Record<string, string> | undefined;
    if (engine.roomTypes.size > 0) {
        roomTypes = {};
        for (const [key, roomType] of engine.roomTypes) roomTypes[key] = roomType;
    }

    return { version: 1, nodes, walls, furniture, wallItems, ...(floors && { floors }), ...(roomTypes && { roomTypes }) };
}
