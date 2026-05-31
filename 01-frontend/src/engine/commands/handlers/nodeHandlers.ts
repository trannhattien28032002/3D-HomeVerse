/**
 * nodeHandlers — xử lý các command về NODE (graph topology):
 *   ENSURE_NODE, MOVE_NODE, MERGE_NODE.
 *
 * Note kiến trúc: Node là source-of-truth của topology. Wall = derived từ
 * (startNodeId, endNodeId) — vì vậy mọi mutation node sẽ kéo theo invalidation
 * polygon của các tường liên quan (để WallGeometrySystem rebuild ở frame kế).
 *
 * Extracted từ `dispatcher.ts` ở Đợt 3 (REFACTOR-PLAN.md).
 */
import { WallNodes } from "src/engine/components/WallNodes";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import type { EngineCommand } from "src/engine/commands/EngineCommands";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";

type EnsureNodeCmd = Extract<EngineCommand, { type: "ENSURE_NODE" }>;
type MoveNodeCmd = Extract<EngineCommand, { type: "MOVE_NODE" }>;
type MergeNodeCmd = Extract<EngineCommand, { type: "MERGE_NODE" }>;

// =================================================================
// ENSURE_NODE — Tạo node nếu chưa tồn tại (idempotent)
// =================================================================
// Lệnh "safe" nhất: nodeRegistry.ensureNode chỉ tạo nếu chưa có.
// Không cần invalidate WallPolygon vì chỉ TẠO node, không di chuyển.
export function handleEnsureNode(command: EnsureNodeCmd, deps: DispatcherDeps): void {
    deps.nodeRegistry.ensureNode(command.nodeId, command.x, command.z);
}

// =================================================================
// MOVE_NODE — Di chuyển node và invalidate tường liên quan
// =================================================================
// Khi node di chuyển, hình học tất cả tường nối node đó thay đổi.
//   1. Cập nhật nodeRegistry.
//   2. Xóa WallPolygon mỗi tường liên quan → WallGeometrySystem rebuild frame sau.
//   3. Recompute AABB ngay (cần cho frustum culling + raycast picking frame này).
//
// Không rebuild mesh ngay vì drag thường spam MOVE_NODE — deferring tốt hơn.
export function handleMoveNode(command: MoveNodeCmd, deps: DispatcherDeps): void {
    const { world, nodeRegistry, wallEntityByWallId } = deps;

    nodeRegistry.move(command.nodeId, command.x, command.z);
    world.markDirty();

    const node = nodeRegistry.get(command.nodeId);
    if (!node) return; // nodeId không tồn tại — ignore (no crash)

    for (const wallId of node.connectedWallIds) {
        const entity = wallEntityByWallId.get(wallId);
        if (entity == null) continue; // edge case: registry biết nhưng entity chưa có

        if (world.hasComponent(entity, WallPolygon)) {
            world.removeComponent(entity, WallPolygon);
        }
        recomputeWallAABB(world, entity, nodeRegistry);
    }
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

        // ─── Reroute: sourceNodeId → targetNodeId trong WallNodes ──────────
        // Mutation trực tiếp lên component — bất kỳ system nào giữ ref sẽ thấy ngay.
        if (wn.startNodeId === sourceNodeId) wn.startNodeId = targetNodeId;
        if (wn.endNodeId   === sourceNodeId) wn.endNodeId   = targetNodeId;

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
                (ewn.startNodeId === otherNodeId  && ewn.endNodeId === targetNodeId)
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
