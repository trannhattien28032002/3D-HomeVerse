/**
 * nodeHandlers — xử lý các command về NODE (graph topology):
 *   ENSURE_NODE, MOVE_NODE, MOVE_NODES, MERGE_NODE.
 *
 * Note kiến trúc: Node là source-of-truth của topology. Wall = derived từ
 * (startNodeId, endNodeId) — vì vậy mọi mutation node sẽ kéo theo invalidation
 * polygon của các tường liên quan (để WallGeometrySystem rebuild ở frame kế).
 *
 * Reconcile wall-item khi topology đổi: khi tường bị RESHAPE (đúng 1 node dời),
 * `t` của cửa/kệ được remap để giữ khoảng cách tuyệt đối tới node neo bất biến
 * (remapItemsOnWall + remapWallItemOnResize). MOVE_NODES là đường DUY NHẤT dời node:
 * gom thao tác thành 1 lần atomic → tường rigid (cả 2 node dời) tự là no-op, tường
 * hàng xóm (1 node dời) được reshape đúng. MOVE_NODE chỉ là wrapper 1-node. Reconcile
 * LUÔN bật (không cờ preserveItems/excludeWallId) — UI chỉ "dời node", engine tự lo.
 *
 * Extracted từ `dispatcher.ts` ở Đợt 3 (REFACTOR-PLAN.md).
 */
import { WallNodes } from "src/engine/components/wall/WallNodes";
import { WallPolygon } from "src/engine/components/wall/WallPolygon";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";
import { Model3D } from "src/engine/components/render/Model3D";
import { Query } from "src/engine/ecs/Query";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import { remapWallItemOnResize } from "src/shared/geometry/wallMount";
import { getFootprint2D } from "src/engine/catalog/FurnitureCatalog";
import type { World } from "src/engine/ecs/World";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

const EPS = 1e-6;

type EnsureNodeCmd = Extract<EngineCommand, { type: "ENSURE_NODE" }>;
type MoveNodeCmd = Extract<EngineCommand, { type: "MOVE_NODE" }>;
type MoveNodesCmd = Extract<EngineCommand, { type: "MOVE_NODES" }>;
type MergeNodeCmd = Extract<EngineCommand, { type: "MERGE_NODE" }>;

/**
 * Invalidate WallPolygon (rebuild mesh frame kế) + recompute AABB ngay (cho
 * frustum culling + raycast frame này) cho từng tường trong `wallIds`.
 */
function invalidateWalls(
    deps: DispatcherDeps,
    wallIds: Iterable<string>,
): void {
    const { world, nodeRegistry, wallEntityByWallId } = deps;
    for (const wallId of wallIds) {
        const entity = wallEntityByWallId.get(wallId);
        if (entity == null) continue; // edge case: registry biết nhưng entity chưa có
        if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
        recomputeWallAABB(world, entity, nodeRegistry);
    }
}

/**
 * Remap `t` của mọi WallOpening/WallMounted bám tường `wallId` khi tường này bị
 * RESHAPE bởi đúng MỘT node dời (`movedEnd`; node kia là neo). Giữ khoảng cách
 * tuyệt đối tới neo (xem remapWallItemOnResize). Trả về true nếu có item bị đổi.
 *
 * WallMountSystem suy lại pose + WallOpeningSystem khoét lại CSG ở frame kế từ `t`
 * mới — không ghi Transform/mesh trực tiếp (cùng triết lý migrateWallItems khi split).
 * Đây là mầm của reconcile-thống-nhất (Phase 3): split/resize/merge sẽ cùng gọi.
 */
function remapItemsOnWall(
    world: World,
    wallId: string,
    movedEnd: "start" | "end",
    lenOld: number,
    lenNew: number,
): boolean {
    if (lenNew <= EPS || lenOld <= EPS) return false;
    let changed = false;
    for (const e of Query.entitiesWith(world, WallOpening)) {
        const wo = world.getComponent(e, WallOpening)!;
        if (wo.hostWallId !== wallId) continue;
        wo.t = remapWallItemOnResize(wo.t, movedEnd, lenOld, lenNew, (wo.width / 2) / lenNew);
        changed = true;
    }
    for (const e of Query.entitiesWith(world, WallMounted)) {
        const wm = world.getComponent(e, WallMounted)!;
        if (wm.hostWallId !== wallId) continue;
        const model = world.getComponent(e, Model3D);
        const width = model ? getFootprint2D(model.modelId).width : 0;
        wm.t = remapWallItemOnResize(wm.t, movedEnd, lenOld, lenNew, (width / 2) / lenNew);
        changed = true;
    }
    return changed;
}

// =================================================================
// ENSURE_NODE — Tạo node nếu chưa tồn tại (idempotent)
// =================================================================
// Lệnh "safe" nhất: nodeRegistry.ensureNode chỉ tạo nếu chưa có.
// Không cần invalidate WallPolygon vì chỉ TẠO node, không di chuyển.
export function handleEnsureNode(command: EnsureNodeCmd, deps: DispatcherDeps): void {
    deps.nodeRegistry.ensureNode(command.nodeId, command.x, command.z);
}

// =================================================================
// MOVE_NODE — Di chuyển MỘT node (wrapper mỏng của MOVE_NODES)
// =================================================================
// Tiện ích cho ca thường gặp "dời 1 node" (kéo endpoint resize). Ủy thác toàn bộ
// cho handleMoveNodes (1-phần-tử) → reconcile item LUÔN bật và đúng: mọi tường nối
// node có đúng 1 node dời ⇒ reshape ⇒ remap `t` giữ cửa/kệ đứng yên (khoảng cách
// tới node neo bất biến). Không còn cờ preserveItems — UI chỉ cần "dời node", engine
// tự lo reconcile (đóng leaky-abstraction: UI không cần biết cơ chế giữ item).
export function handleMoveNode(command: MoveNodeCmd, deps: DispatcherDeps): void {
    handleMoveNodes(
        { type: "MOVE_NODES", moves: [{ nodeId: command.nodeId, x: command.x, z: command.z }] },
        deps,
    );
}

// =================================================================
// MOVE_NODES — Dời NHIỀU node trong MỘT thao tác atomic
// =================================================================
// Dùng cho tịnh tiến cứng thân tường (dời cả 2 node cùng delta) — thay cho chuỗi
// 2×MOVE_NODE vốn lộ trạng thái trung gian sai (1 node đã dời, node kia chưa) khiến
// remap tính `t` theo length vô nghĩa → trước đây phải vá bằng cờ excludeWallId.
//
// Atomic: chụp len CŨ + node-nào-dời cho MỌI tường bị ảnh hưởng TRƯỚC, áp tất cả
// move, rồi reconcile MỘT lần:
//   - Tường cả-2-node-dời (rigid)  → lenNew==lenOld ⇒ t giữ nguyên (item bám theo). Skip.
//   - Tường đúng-1-node-dời (reshape) → remap giữ item đứng yên tới node neo.
// Nhờ atomic, tam giác suy biến (hàng xóm nối cả 2 node) cũng được phân loại đúng
// (rigid → skip) thay vì bị remap 2 lần với len trung gian sai.
export function handleMoveNodes(command: MoveNodesCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry, wallEntityByWallId } = deps;
    if (command.moves.length === 0) return;

    const movedIds = new Set(command.moves.map((m) => m.nodeId));

    // Gom tường bị ảnh hưởng (union) + chụp len CŨ + node-nào-dời, TRƯỚC khi áp move.
    type WallCap = {
        wallId: string; startNodeId: string; endNodeId: string;
        movedStart: boolean; movedEnd: boolean; lenOld: number;
    };
    const caps: WallCap[] = [];
    const affected = new Set<string>();
    for (const id of movedIds) {
        const node = nodeRegistry.get(id);
        if (!node) continue;
        for (const wallId of node.connectedWallIds) {
            if (affected.has(wallId)) continue;
            affected.add(wallId);
            const ent = wallEntityByWallId.get(wallId);
            if (ent == null) continue;
            const wn = world.getComponent(ent, WallNodes);
            if (!wn) continue;
            const s = nodeRegistry.get(wn.startNodeId);
            const e = nodeRegistry.get(wn.endNodeId);
            if (!s || !e) continue;
            caps.push({
                wallId, startNodeId: wn.startNodeId, endNodeId: wn.endNodeId,
                movedStart: movedIds.has(wn.startNodeId), movedEnd: movedIds.has(wn.endNodeId),
                lenOld: Math.hypot(s.x - e.x, s.z - e.z),
            });
        }
    }

    // Áp TẤT CẢ move trước (atomic) rồi mới invalidate + reconcile.
    for (const m of command.moves) nodeRegistry.move(m.nodeId, m.x, m.z);
    world.markDirty();

    invalidateWalls(deps, affected);

    let changed = false;
    for (const cap of caps) {
        // Cả 2 node dời (rigid translate) → t giữ nguyên; (cả 2 không-dời không xảy ra
        // vì cap chỉ sinh từ tường nối node-đang-dời). Chỉ reshape khi đúng 1 node dời.
        if (cap.movedStart === cap.movedEnd) continue;
        const s = nodeRegistry.get(cap.startNodeId);
        const e = nodeRegistry.get(cap.endNodeId);
        if (!s || !e) continue;
        const lenNew = Math.hypot(s.x - e.x, s.z - e.z);
        const role: "start" | "end" = cap.movedStart ? "start" : "end";
        if (remapItemsOnWall(world, cap.wallId, role, cap.lenOld, lenNew)) changed = true;
    }
    if (changed) world.markDirty();
}

// =================================================================
// MERGE_NODE — Gộp source → target node (junction)
// =================================================================
// Use case: kéo đầu tường sát vào node khác → gộp thành junction.
//
// 3 sub-case cho mỗi wall của sourceNode:
//   - **Case 2 (degenerate)**: sau reroute, start == end → xóa tường luôn.
//     Xảy ra khi source và target là 2 đầu của cùng tường.
//   - **Case 3 (duplicate)**: target đã có tường nối với otherNode → xóa
//     tường đang reroute (giữ tường cũ).
//   - **Case 1 (bình thường)**: connectWall(target) + invalidate polygon.
//
// Sau vòng lặp: invalidate polygon tất cả tường của targetNode (topology
// vừa thay đổi). Cuối cùng: xóa sourceNode.
//
// TODO: cân nhắc immutable update thay vì mutate WallNodes in-place.
export function handleMergeNode(command: MergeNodeCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry, wallEntityByWallId, entityRegistry } = deps;
    const { sourceNodeId, targetNodeId } = command;

    if (sourceNodeId === targetNodeId) return; // no-op

    const sourceNode = nodeRegistry.get(sourceNodeId);
    if (!sourceNode) return;

    // Clone Set thành Array trước iterate — loop sẽ gọi disconnectWall() mà mutate Set.
    for (const wallId of Array.from(sourceNode.connectedWallIds)) {
        const ent = wallEntityByWallId.get(wallId);
        if (ent == null) continue;

        const wn = world.getComponent(ent, WallNodes);
        if (!wn) continue;

        // Chụp TRƯỚC reroute để reconcile item (Case 1): endpoint nhảy source→target
        // ⇒ tường reshape ⇒ giữ cửa/kệ đứng yên tới node neo (đầu KHÔNG đổi).
        const sourceWasStart = wn.startNodeId === sourceNodeId;
        const anchorNodeId = sourceWasStart ? wn.endNodeId : wn.startNodeId;
        const anchorBefore = nodeRegistry.get(anchorNodeId);
        const lenOld = anchorBefore
            ? Math.hypot(sourceNode.x - anchorBefore.x, sourceNode.z - anchorBefore.z)
            : 0;

        // ─── Reroute: sourceNodeId → targetNodeId trong WallNodes ──────────
        // Mutation trực tiếp lên component — bất kỳ system nào giữ ref sẽ thấy ngay.
        if (wn.startNodeId === sourceNodeId) wn.startNodeId = targetNodeId;
        if (wn.endNodeId === sourceNodeId) wn.endNodeId = targetNodeId;

        nodeRegistry.disconnectWall(sourceNodeId, wallId);

        // ─── Case 2: Degenerate wall (chiều dài 0 sau reroute) ─────────────
        if (wn.startNodeId === wn.endNodeId) {
            nodeRegistry.disconnectWall(wn.startNodeId, wallId);
            entityRegistry.disposeEntity(ent);
            wallEntityByWallId.delete(wallId);
            continue;
        }

        // ─── Case 3: Duplicate wall ────────────────────────────────────────
        const otherNodeId = wn.startNodeId === targetNodeId ? wn.endNodeId : wn.startNodeId;

        const targetNodeForDupCheck = nodeRegistry.get(targetNodeId);
        const isDuplicate = targetNodeForDupCheck && [...targetNodeForDupCheck.connectedWallIds].some(existingWid => {
            if (existingWid === wallId) return false;
            const existingEnt = wallEntityByWallId.get(existingWid);
            if (existingEnt == null) return false;
            const ewn = world.getComponent(existingEnt, WallNodes);
            if (!ewn) return false;
            return (
                (ewn.startNodeId === targetNodeId && ewn.endNodeId === otherNodeId) ||
                (ewn.startNodeId === otherNodeId && ewn.endNodeId === targetNodeId)
            );
        });

        if (isDuplicate) {
            nodeRegistry.disconnectWall(otherNodeId, wallId);
            entityRegistry.disposeEntity(ent);
            wallEntityByWallId.delete(wallId);
            continue;
        }

        // ─── Case 1 (bình thường) ──────────────────────────────────────────
        nodeRegistry.connectWall(targetNodeId, wallId);

        if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);
        recomputeWallAABB(world, ent, nodeRegistry);

        // Reconcile item: tường vừa reshape (endpoint nhảy về targetNode). Giữ cửa/kệ
        // đứng yên tới node neo (đầu không đổi) — fix sai lệch khi merge (cùng helper resize).
        const targetAfter = nodeRegistry.get(targetNodeId);
        if (targetAfter && anchorBefore && lenOld > EPS) {
            const lenNew = Math.hypot(targetAfter.x - anchorBefore.x, targetAfter.z - anchorBefore.z);
            if (remapItemsOnWall(world, wallId, sourceWasStart ? "start" : "end", lenOld, lenNew)) {
                world.markDirty();
            }
        }
    }

    // Sau khi reroute: invalidate toàn bộ tường của targetNode (topology thay đổi).
    const targetNode = nodeRegistry.get(targetNodeId);
    if (targetNode) {
        for (const wallId of targetNode.connectedWallIds) {
            const ent = wallEntityByWallId.get(wallId);
            if (ent != null && world.hasComponent(ent, WallPolygon)) {
                world.removeComponent(ent, WallPolygon);
            }
        }
    }

    // Xóa sourceNode — đã không còn tường nào nối tới.
    nodeRegistry.deleteNode(sourceNodeId);
}
