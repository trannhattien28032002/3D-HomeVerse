/**
 * =============================================================================
 * DISPATCHER — Bộ xử lý lệnh trung tâm của engine HomeVerse
 * =============================================================================
 *
 * MỤC ĐÍCH TỔNG THỂ
 * -----------------
 * Dispatcher là điểm trung tâm duy nhất được phép thực hiện mutation lên cấu
 * trúc topology (tường, node) của world ECS. Mọi thay đổi về floor plan phải
 * đi qua đây — không có ngoại lệ. Thiết kế này áp dụng Command Pattern kết
 * hợp ECS (Entity Component System):
 *
 *   - Command Pattern: Mỗi thao tác UI được encode thành một EngineCommand
 *     (plain object, serializable), tách biệt hoàn toàn "ý định" khỏi "thực thi".
 *     Điều này cho phép undo/redo, replaying, và networking trong tương lai.
 *
 *   - ECS: World chứa các Entity (số nguyên ID). Mỗi entity gắn với các
 *     Component (plain data structs: WallNodes, WallSize, WallPolygon, Mesh...).
 *     System chạy theo frame sẽ đọc component và sinh ra side effect (mesh
 *     rebuild, render). Dispatcher chỉ thay đổi data — Systems xử lý display.
 *
 * LUỒNG DỮ LIỆU TỔNG QUAN
 * -----------------------
 *
 *   [UI Layer]
 *      │  Người dùng vẽ tường / kéo node
 *      ▼
 *   dispatch(command: EngineCommand)
 *      │  Switch theo command.type
 *      ▼
 *   [ECS Mutation]
 *      │  Thay đổi component data trong World
 *      │  Cập nhật NodeRegistry (graph topology)
 *      │  Cập nhật wallEntityByWallId (lookup table)
 *      ▼
 *   [WallGeometrySystem] — chạy ở frame kế tiếp
 *      │  Phát hiện entity thiếu WallPolygon (bị remove = cần rebuild)
 *      │  Tính lại polygon 2D từ NodeRegistry
 *      │  Extrude thành mesh 3D, upload lên GPU
 *      ▼
 *   [SnapshotSystem] — chạy sau WallGeometrySystem
 *      │  Emit event "snapshot" với dữ liệu floor plan hiện tại
 *      ▼
 *   [React] — subscribe event "snapshot"
 *      └─ Re-render UI (2D canvas, inspector panel...)
 *
 * TẠI SAO DÙNG "INVALIDATION" THAY VÌ REBUILD NGAY LẬP TỨC?
 * ----------------------------------------------------------
 * Khi node di chuyển, có thể nhiều tường cần rebuild mesh cùng lúc. Nếu
 * rebuild ngay trong dispatch, sẽ rebuild nhiều lần trong một frame nếu có
 * nhiều lệnh liên tiếp (vd: RESOLVE_INTERSECTIONS gọi nhiều SPLIT_WALL).
 * Thay vào đó, dispatch chỉ "xóa" WallPolygon component — báo hiệu tường đó
 * đã stale. WallGeometrySystem sẽ batch rebuild tất cả tường stale một lần/frame.
 *
 * CÁC LỆNH VÀ SIDE-EFFECTS
 * ------------------------
 *   ENSURE_NODE           → nodeRegistry.ensureNode (idempotent, safe to call nhiều lần)
 *   MOVE_NODE             → cập nhật position + invalidate WallPolygon tất cả tường liên quan
 *   ADD_WALL              → createWall entity + link nodeRegistry + update maxWallIdRef
 *   REMOVE_WALL           → dispose mesh, destroy entity, xóa orphan nodes
 *   MERGE_NODE            → reroute tất cả wall từ source → target, xóa source node
 *   SPLIT_WALL            → bisect tường thành 2, tạo node mới tại điểm cắt
 *   RESOLVE_INTERSECTIONS → tự động tìm giao điểm tường mới với tường cũ, split cả hai
 *   UPDATE_WALL           → cập nhật thickness/height, invalidate polygon để rebuild mesh
 */
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

import { createWall } from "src/engine/game/WallFactory";
import { Mesh } from "src/engine/components/Mesh";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallSize } from "src/engine/components/WallSize";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";

// =============================================================================
// DEPENDENCY INJECTION — tại sao dùng deps object thay vì global state?
// =============================================================================
// createDispatcher nhận một "deps bag" thay vì import global singleton. Lý do:
//   1. Testability: test có thể inject mock world, mock nodeRegistry.
//   2. Lifetime control: dispatcher không quyết định ai sống bao lâu.
//   3. Multiple instances: có thể có nhiều dispatcher cho nhiều floor (tương lai).
//
// Mỗi field trong DispatcherDeps:
//   world              — ECS store chứa tất cả entity + component data
//   scene              — THREE.Scene để createWall có thể add mesh vào
//   nodeRegistry       — Graph topology: node positions + wall connections
//   wallEntityByWallId — Lookup table: wallId (domain ID) → entity (ECS ID)
//                        wallId là ID logic (1, 2, 3...), entity là ID ECS (0, 1, 2...)
//                        Cần hai ID vì ECS entity có thể bị recycle.
//   maxWallIdRef       — Counter cho wallId tiếp theo. Dùng object thay vì number
//                        để closure trong dispatch() luôn đọc giá trị mới nhất
//                        (nếu là primitive, closure sẽ capture value tại thời điểm tạo).
//   meshRegistry       — Quản lý THREE.Mesh: tạo, lấy, dispose. Tránh memory leak.
//   materialRegistry   — Cache material THREE.js (tránh tạo duplicate material).
export type DispatcherDeps = {
    world: World;
    scene: THREE.Scene;
    nodeRegistry: NodeRegistry;
    wallEntityByWallId: Map<number, number>;
    /** Mutable ref — SPLIT_WALL/ADD_WALL increment, RESOLVE_INTERSECTIONS đọc để lấy ID mới nhất. */
    maxWallIdRef: { value: number };
    meshRegistry: MeshRegistry;
    materialRegistry: MaterialRegistry;
};

// =============================================================================
// createDispatcher — Factory function trả về hàm dispatch
// =============================================================================
// Tại sao dùng factory function thay vì class?
//   - Closure tự nhiên giữ deps mà không cần bind(this) hay arrow method.
//   - Caller chỉ cần giữ một hàm (dispatch) — interface đơn giản tối đa.
//   - Dễ compose: có thể wrap dispatch để thêm logging, middleware (tương lai).
//
// TODO: Nếu cần middleware (logging, undo stack, network sync), xem xét
//       đổi thành class DispatcherPipeline với pipeline pattern để dễ inject.
export function createDispatcher(deps: DispatcherDeps): (command: EngineCommand) => void {
    // Destructure một lần để các handler bên trong không phải đọc qua deps mỗi lần.
    const { world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry } = deps;

    // dispatch là hàm nội bộ — được return ra ngoài để caller sử dụng.
    // Tại sao khai báo là function declaration (không phải const)?
    //   → RESOLVE_INTERSECTIONS gọi dispatch() đệ quy. Function declaration
    //     được hoisted trong scope, nên có thể tham chiếu trước khi định nghĩa.
    function dispatch(command: EngineCommand): void {
        switch (command.type) {

            // =================================================================
            // ENSURE_NODE — Tạo node nếu chưa tồn tại (idempotent)
            // =================================================================
            // Đây là lệnh "safe" nhất: nodeRegistry.ensureNode chỉ tạo node mới
            // nếu nodeId chưa có, không làm gì nếu đã tồn tại.
            //
            // Use case chính: UI vẽ tường thường ensure cả hai đầu trước khi
            // ADD_WALL, đảm bảo node đã tồn tại với đúng tọa độ.
            //
            // Lưu ý: Không cần invalidate WallPolygon vì chỉ TẠO node, không
            // thay đổi vị trí node đã có.
            case "ENSURE_NODE": {
                nodeRegistry.ensureNode(command.nodeId, command.x, command.z);
                break;
            }

            // =================================================================
            // MOVE_NODE — Di chuyển node và invalidate tường liên quan
            // =================================================================
            // Khi node di chuyển, hình học của tất cả tường nối vào node đó
            // thay đổi theo. Ta cần:
            //   1. Cập nhật vị trí trong nodeRegistry.
            //   2. Xóa WallPolygon của mỗi tường liên quan → báo WallGeometrySystem
            //      rebuild mesh ở frame tiếp theo.
            //   3. Recompute AABB (Axis-Aligned Bounding Box) cho frustum culling
            //      và raycast picking trong editor 2D.
            //
            // THIẾT KẾ: Tại sao không rebuild mesh ngay trong dispatch?
            //   → Nếu UI gửi nhiều MOVE_NODE liên tiếp (drag), mỗi frame chỉ
            //     cần rebuild một lần — deferring về cho System xử lý là hiệu quả hơn.
            case "MOVE_NODE": {
                nodeRegistry.move(command.nodeId, command.x, command.z);

                // Lấy node để biết danh sách tường kết nối.
                const node = nodeRegistry.get(command.nodeId);
                if (!node) break; // nodeId không tồn tại — ignore (không crash)

                for (const wallId of node.connectedWallIds) {
                    const entity = wallEntityByWallId.get(wallId);
                    if (entity == null) continue; // Tường trong registry nhưng chưa có entity (rare edge case)

                    // Xóa WallPolygon = đánh dấu tường này cần rebuild polygon + mesh.
                    // WallGeometrySystem sẽ phát hiện entity thiếu WallPolygon và rebuild.
                    if (world.hasComponent(entity, WallPolygon)) {
                        world.removeComponent(entity, WallPolygon);
                    }

                    // Cập nhật AABB để 2D viewport biết vùng không gian của tường.
                    // AABB thay đổi ngay vì nó dùng cho picking/culling trong frame hiện tại.
                    recomputeWallAABB(world, entity, nodeRegistry);
                }
                break;
            }

            // =================================================================
            // ADD_WALL — Tạo tường mới giữa hai node đã tồn tại
            // =================================================================
            // Pipeline:
            //   1. Validate: cả hai node phải tồn tại.
            //   2. Kiểm tra duplicate: không tạo tường trùng (A→B đã có thì skip).
            //   3. Tính geometry sơ bộ: center point, length (cho createWall).
            //   4. createWall → tạo ECS entity với đầy đủ component.
            //   5. Kết nối hai node vào tường mới trong nodeRegistry.
            //   6. Đăng ký vào wallEntityByWallId + cập nhật maxWallIdRef.
            //   7. Invalidate WallPolygon của tường hàng xóm tại hai đầu node
            //      (vì topology thay đổi ảnh hưởng đến cách vẽ joint giữa các tường).
            case "ADD_WALL": {
                const sn = nodeRegistry.get(command.startNodeId);
                const en = nodeRegistry.get(command.endNodeId);
                if (!sn || !en) {
                    // WARNING: Nếu UI gọi ADD_WALL trước ENSURE_NODE, sẽ bị warn ở đây.
                    // Thứ tự lệnh quan trọng: ENSURE_NODE phải đến trước ADD_WALL.
                    console.warn(`ADD_WALL: node ${command.startNodeId} or ${command.endNodeId} not found`);
                    break;
                }

                // Kiểm tra xem cặp node này đã có tường nối chưa (bất kể chiều nào).
                // Logic: duyệt qua tất cả tường của startNode, kiểm tra WallNodes component.
                // WARNING: Đây là O(degree * 1) — thường OK nhưng nếu node có hàng trăm
                //          tường kết nối (edge case cực đoan), có thể chậm.
                const pairAlreadyExists = [...sn.connectedWallIds].some(wid => {
                    const ent = wallEntityByWallId.get(wid);
                    if (ent == null) return false;
                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) return false;
                    // Tường là undirected: (A→B) == (B→A)
                    return (
                        (wn.startNodeId === command.startNodeId && wn.endNodeId === command.endNodeId) ||
                        (wn.startNodeId === command.endNodeId   && wn.endNodeId === command.startNodeId)
                    );
                });
                if (pairAlreadyExists) {
                    console.warn(`ADD_WALL: wall between node ${command.startNodeId} and ${command.endNodeId} already exists — skipped.`);
                    break;
                }

                // Tính tọa độ trung tâm và chiều dài để khởi tạo mesh ban đầu.
                // WallGeometrySystem sẽ tính chính xác hơn từ polygon, nhưng createWall
                // cần ước tính ban đầu để đặt transform của THREE.Mesh.
                const dx = en.x - sn.x, dz = en.z - sn.z;
                const length = Math.hypot(dx, dz);
                const cx = (sn.x + en.x) / 2;
                const cz = (sn.z + en.z) / 2;

                // createWall tạo ECS entity với các component:
                //   WallNodes, WallSize, Mesh, AABB (và thêm THREE.Mesh vào scene).
                // cy = 1.6 là half-height của tường 3.2m (đặt tâm mesh ở giữa chiều cao).
                const entity = createWall(world, scene, {
                    wallId: command.wallId,
                    startNodeId: command.startNodeId,
                    endNodeId: command.endNodeId,
                    cx, cy: 1.6, cz,
                    length,
                    height: 3.2,       // Chiều cao tường mặc định (hardcoded 3.2m)
                    thickness: command.thickness,
                }, meshRegistry, materialRegistry);

                // Kết nối topology: mỗi node phải biết nó thuộc tường nào.
                nodeRegistry.connectWall(command.startNodeId, command.wallId);
                nodeRegistry.connectWall(command.endNodeId, command.wallId);

                // Đăng ký lookup table để sau này có thể: wallId → entity.
                wallEntityByWallId.set(command.wallId, entity);

                // Cập nhật counter wallId cao nhất. Cần thiết để RESOLVE_INTERSECTIONS
                // và SPLIT_WALL biết ID nào an toàn để dùng tiếp theo.
                if (command.wallId > maxWallIdRef.value) maxWallIdRef.value = command.wallId;

                // Invalidate WallPolygon của các tường hàng xóm.
                // Lý do: khi có tường mới kết nối vào node, cách vẽ "joint" (góc giao)
                // giữa tường cũ và tường mới thay đổi → tường cũ cần rebuild polygon.
                for (const nodeId of [command.startNodeId, command.endNodeId]) {
                    const nd = nodeRegistry.get(nodeId);
                    if (!nd) continue;
                    for (const wid of nd.connectedWallIds) {
                        if (wid === command.wallId) continue; // Skip tường vừa tạo
                        const ent = wallEntityByWallId.get(wid);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                    }
                }
                break;
            }

            // =================================================================
            // REMOVE_WALL — Xóa tường và dọn dẹp tài nguyên
            // =================================================================
            // Thứ tự cleanup quan trọng:
            //   1. Ngắt kết nối topology trong nodeRegistry (trước khi xóa entity).
            //   2. Dispose THREE.Mesh (giải phóng GPU buffer + loại khỏi scene).
            //   3. Destroy ECS entity (giải phóng component storage).
            //   4. Xóa lookup table entry.
            //   5. Xóa "orphan node" — node không còn tường nào kết nối.
            //
            // TẠI SAO XÓA ORPHAN NODE?
            //   NodeRegistry lưu graph topology. Node không có tường nào =
            //   "floating point" không có nghĩa trong floor plan. Để graph sạch,
            //   orphan node phải bị xóa theo tường.
            //
            // WARNING: Không invalidate WallPolygon của tường hàng xóm ở đây!
            //   Tường hàng xóm cần rebuild khi node bị xóa (vì đầu joint thay đổi).
            //   TODO: Nên invalidate các tường hàng xóm trước khi xóa node.
            case "REMOVE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) break; // Tường không tồn tại — no-op

                // Lấy WallNodes để biết hai node đầu và cuối.
                const wn = world.getComponent(entity, WallNodes);
                const affectedNodeIds: number[] = [];

                if (wn) {
                    // Ngắt kết nối trong graph topology trước khi xóa entity.
                    nodeRegistry.disconnectWall(wn.startNodeId, command.wallId);
                    nodeRegistry.disconnectWall(wn.endNodeId, command.wallId);
                    affectedNodeIds.push(wn.startNodeId, wn.endNodeId);
                }

                // Dispose mesh nếu entity có Mesh component.
                // meshRegistry.dispose giải phóng THREE geometry/material khỏi GPU
                // và remove THREE.Mesh khỏi scene.
                // Key convention: "wall-{entityId}" — phải khớp với key trong createWall.
                if (world.hasComponent(entity, Mesh)) {
                    meshRegistry.dispose(`wall-${entity}`);
                }

                // Xóa ECS entity. Sau lệnh này, entity ID có thể được recycle.
                world.destroyEntity(entity);
                wallEntityByWallId.delete(command.wallId);

                // Dọn dẹp orphan nodes: node nào không còn tường kết nối thì xóa.
                for (const nodeId of affectedNodeIds) {
                    const nd = nodeRegistry.get(nodeId);
                    if (nd && nd.connectedWallIds.size === 0) {
                        nodeRegistry.deleteNode(nodeId);
                    }
                }
                break;
            }

            // =================================================================
            // MERGE_NODE — Gộp hai node thành một (source → target)
            // =================================================================
            // Use case: Khi người dùng kéo đầu tường sát vào node khác, hệ thống
            // gộp hai node lại để tạo junction (ngã rẽ tường).
            //
            // Đây là lệnh phức tạp nhất vì phải xử lý nhiều edge case:
            //
            //   Case 1: Wall bình thường
            //     → Reroute wallId từ sourceNode sang targetNode
            //     → connectWall(targetNodeId, wallId)
            //     → Invalidate WallPolygon để rebuild
            //
            //   Case 2: Degenerate wall (start == end sau merge)
            //     Xảy ra khi: source và target đều là đầu của cùng một tường.
            //     Wall đó sẽ có startNodeId == endNodeId → không thể render.
            //     → Xóa tường đó luôn.
            //
            //   Case 3: Duplicate wall (sau khi reroute, cặp node đã có tường)
            //     Xảy ra khi: target đã có tường nối với otherNode.
            //     → Xóa tường bị reroute (giữ tường đã tồn tại).
            //
            // LUỒNG XỬ LÝ:
            //   for each wallId in sourceNode.connectedWallIds:
            //     1. Reroute sourceNodeId → targetNodeId trong WallNodes
            //     2. disconnectWall(sourceNodeId, wallId)
            //     3. [Case 2] if degenerate: dispose + delete, continue
            //     4. [Case 3] if duplicate: dispose + delete, continue
            //     5. [Normal] connectWall(targetNodeId, wallId) + invalidate polygon
            //   Sau vòng lặp: invalidate polygon tất cả tường của targetNode
            //   Cuối cùng: xóa sourceNode
            //
            // TODO: Xem xét dùng immutable update thay vì mutate WallNodes in-place
            //       để tránh bug nếu component được share reference.
            case "MERGE_NODE": {
                const { sourceNodeId, targetNodeId } = command;

                // Guard: merge chính mình = no-op.
                if (sourceNodeId === targetNodeId) break;

                const sourceNode = nodeRegistry.get(sourceNodeId);
                if (!sourceNode) break;

                // Phải clone Set thành Array trước khi iterate vì loop bên trong
                // sẽ gọi disconnectWall() → modify Set đang được iterate → undefined behavior.
                for (const wallId of Array.from(sourceNode.connectedWallIds)) {
                    const ent = wallEntityByWallId.get(wallId);
                    if (ent == null) continue;

                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) continue;

                    // ─── Reroute: thay sourceNodeId bằng targetNodeId ─────────
                    // WARNING: Mutation trực tiếp lên component object.
                    // WallNodes component không được clone — nếu bất kỳ system nào
                    // giữ reference đến wn, nó sẽ thấy sự thay đổi ngay lập tức.
                    if (wn.startNodeId === sourceNodeId) wn.startNodeId = targetNodeId;
                    if (wn.endNodeId   === sourceNodeId) wn.endNodeId   = targetNodeId;

                    // Ngắt kết nối sourceNode khỏi tường này.
                    nodeRegistry.disconnectWall(sourceNodeId, wallId);

                    // ─── Case 2: Degenerate wall ─────────────────────────────
                    // Sau khi reroute, nếu start == end → tường có chiều dài 0.
                    // Điều này xảy ra khi source và target là hai đầu của cùng tường.
                    if (wn.startNodeId === wn.endNodeId) {
                        // Ngắt luôn cả targetNodeId (nó đã bị gán vào cả hai đầu).
                        nodeRegistry.disconnectWall(wn.startNodeId, wallId);
                        meshRegistry.dispose(`wall-${ent}`);
                        world.destroyEntity(ent);
                        wallEntityByWallId.delete(wallId);
                        continue; // Bỏ qua phần xử lý bình thường
                    }

                    // ─── Case 3: Duplicate wall ───────────────────────────────
                    // otherNodeId: node kia (không phải targetNode) của tường này.
                    const otherNodeId = wn.startNodeId === targetNodeId ? wn.endNodeId : wn.startNodeId;

                    // Kiểm tra targetNode đã có tường nối với otherNodeId chưa.
                    const targetNode2 = nodeRegistry.get(targetNodeId);
                    const isDuplicate = targetNode2 && [...targetNode2.connectedWallIds].some(existingWid => {
                        if (existingWid === wallId) return false; // Bỏ qua chính nó
                        const existingEnt = wallEntityByWallId.get(existingWid);
                        if (existingEnt == null) return false;
                        const ewn = world.getComponent(existingEnt, WallNodes);
                        if (!ewn) return false;
                        // Undirected check
                        return (
                            (ewn.startNodeId === targetNodeId && ewn.endNodeId === otherNodeId) ||
                            (ewn.startNodeId === otherNodeId  && ewn.endNodeId === targetNodeId)
                        );
                    });

                    if (isDuplicate) {
                        // Tường bị reroute là duplicate → xóa nó, giữ tường cũ.
                        nodeRegistry.disconnectWall(otherNodeId, wallId);
                        meshRegistry.dispose(`wall-${ent}`);
                        world.destroyEntity(ent);
                        wallEntityByWallId.delete(wallId);
                        continue;
                    }

                    // ─── Case bình thường: kết nối tường với targetNode ───────
                    nodeRegistry.connectWall(targetNodeId, wallId);

                    // Invalidate polygon để WallGeometrySystem rebuild mesh.
                    if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);

                    // Cập nhật AABB ngay vì tọa độ node đã thay đổi.
                    recomputeWallAABB(world, ent, nodeRegistry);
                }

                // Sau khi reroute tất cả tường, invalidate toàn bộ tường của targetNode.
                // Lý do: topology của targetNode vừa thay đổi (có thêm tường mới kết nối)
                // → cách vẽ joint phải được tính lại.
                const targetNode = nodeRegistry.get(targetNodeId);
                if (targetNode) {
                    for (const wallId of targetNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                    }
                }

                // Cuối cùng: xóa sourceNode khỏi graph. Tất cả tường của nó đã được
                // reroute hoặc xóa ở vòng lặp trên nên node này không còn kết nối nào.
                nodeRegistry.deleteNode(sourceNodeId);
                break;
            }

            // =================================================================
            // SPLIT_WALL — Chia đôi một tường tại một điểm
            // =================================================================
            // Use case: Khi người dùng kéo tường mới và cắt qua tường đã có,
            // tường cũ phải được chia thành hai tường tại điểm giao.
            //
            // Input:
            //   originalWallId  — tường gốc cần chia
            //   newWallId       — ID cho nửa tường thứ hai (được cấp phát bởi caller)
            //   newNodeId       — ID cho node mới tại điểm chia
            //   x, z            — tọa độ của điểm chia
            //
            // Sau khi SPLIT_WALL:
            //   Tường gốc (originalWallId): [startNode → newNode]  (nửa đầu)
            //   Tường mới (newWallId):       [newNode  → endNode]   (nửa sau)
            //
            // LUỒNG XỬ LÝ:
            //   1. Lấy entity và WallNodes của tường gốc.
            //   2. Ensure + move newNode đến (x, z).
            //   3. Reroute tường gốc: endNodeId ← newNodeId (nửa đầu).
            //   4. Update nodeRegistry topology cho tường gốc.
            //   5. createWall mới cho nửa sau [newNode → endNode].
            //   6. Update nodeRegistry + wallEntityByWallId + maxWallIdRef.
            //   7. Invalidate WallPolygon tường hàng xóm tại endNode.
            //
            // WARNING: startNodeId được destructure nhưng không dùng trong handler này.
            //          Dòng `void startNodeId` là workaround để tắt TS unused-vars warning.
            //          Nếu refactor, hãy loại bỏ dòng này và chỉ destructure những gì cần.
            case "SPLIT_WALL": {
                const entity = wallEntityByWallId.get(command.originalWallId);
                if (entity == null) break;
                const wn = world.getComponent(entity, WallNodes);
                if (!wn) break;

                // Lưu lại endNodeId trước khi bị reroute.
                const { startNodeId, endNodeId, thickness } = wn;

                // Tạo (hoặc đảm bảo tồn tại) newNode tại điểm chia.
                // ensureNode là idempotent nên an toàn gọi nhiều lần.
                nodeRegistry.ensureNode(command.newNodeId, command.x, command.z);
                nodeRegistry.move(command.newNodeId, command.x, command.z);

                // Nếu newNode đã có tường kết nối (từ trước), invalidate chúng.
                // Trường hợp này xảy ra khi newNodeId được tái sử dụng (rare).
                const newNode = nodeRegistry.get(command.newNodeId);
                if (newNode) {
                    for (const wallId of newNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null) {
                            if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);
                            recomputeWallAABB(world, ent, nodeRegistry);
                        }
                    }
                }

                // ─── Reroute nửa đầu của tường gốc ──────────────────────────
                // Tường gốc bây giờ là [startNode → newNode].
                // WARNING: Mutation trực tiếp lên WallNodes component (xem MERGE_NODE).
                wn.endNodeId = command.newNodeId;

                // Cập nhật topology: endNode cũ không còn kết nối với tường gốc.
                nodeRegistry.disconnectWall(endNodeId, command.originalWallId);
                // newNode kết nối với tường gốc (nửa đầu).
                nodeRegistry.connectWall(command.newNodeId, command.originalWallId);

                // Invalidate tường gốc để rebuild polygon/mesh.
                if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
                recomputeWallAABB(world, entity, nodeRegistry);

                // ─── Tạo tường mới cho nửa sau ───────────────────────────────
                // Nửa sau: [newNode → endNode] với thickness kế thừa từ tường gốc.
                const endNode = nodeRegistry.get(endNodeId)!;
                const cx = (command.x + endNode.x) / 2;
                const cz = (command.z + endNode.z) / 2;
                const length = Math.hypot(endNode.x - command.x, endNode.z - command.z);

                const newEntity = createWall(world, scene, {
                    wallId: command.newWallId,
                    startNodeId: command.newNodeId,
                    endNodeId,
                    cx, cy: 1.6, cz,
                    length,
                    height: 3.2,
                    thickness,       // Kế thừa thickness từ tường gốc
                }, meshRegistry, materialRegistry);

                // Kết nối topology cho tường mới.
                nodeRegistry.connectWall(command.newNodeId, command.newWallId);
                nodeRegistry.connectWall(endNodeId, command.newWallId);
                wallEntityByWallId.set(command.newWallId, newEntity);

                // Cập nhật maxWallIdRef — QUAN TRỌNG cho RESOLVE_INTERSECTIONS.
                // RESOLVE_INTERSECTIONS gọi nhiều SPLIT_WALL liên tiếp và dùng
                // maxWallIdRef.value + 1 để cấp wallId mới mỗi lần.
                if (command.newWallId > maxWallIdRef.value) maxWallIdRef.value = command.newWallId;

                // Invalidate tường hàng xóm tại endNode (topology của endNode thay đổi).
                for (const wallId of endNode.connectedWallIds) {
                    const ent = wallEntityByWallId.get(wallId);
                    if (ent != null && world.hasComponent(ent, WallPolygon)) {
                        world.removeComponent(ent, WallPolygon);
                    }
                }

                // Suppress TS unused-vars: startNodeId is intentionally unused after destructuring
                void startNodeId;
                break;
            }

            // =================================================================
            // UPDATE_WALL — Cập nhật thuộc tính tường (thickness, height)
            // =================================================================
            // Lệnh đơn giản: cập nhật data trong component, invalidate polygon.
            //
            // Tại sao phải invalidate WallPolygon khi chỉ đổi HEIGHT?
            //   Polygon 2D không thay đổi khi height thay đổi (vẫn là hình chiếu XZ),
            //   nhưng WallGeometrySystem rebuild toàn bộ mesh khi phát hiện polygon
            //   bị xóa — đây là signal để nó biết cần cập nhật cả chiều cao mesh.
            //
            // TODO: Tách biệt signal cho "polygon changed" vs "height changed" để
            //       WallGeometrySystem có thể update height-only mà không cần
            //       recompute polygon (tối ưu hơn cho performance).
            case "UPDATE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) break;

                const wn = world.getComponent(entity, WallNodes);
                const size = world.getComponent(entity, WallSize);

                // Cập nhật thickness trong WallNodes (dùng cho polygon calculation).
                if (wn && command.thickness !== undefined) wn.thickness = command.thickness;

                // Cập nhật WallSize (dùng cho mesh extrusion).
                if (size) {
                    if (command.thickness !== undefined) size.thickness = command.thickness;
                    if (command.height !== undefined)    size.height    = command.height;
                }

                // Remove polygon so WallGeometrySystem does a full rebuild (needed for height changes
                // where the XZ polygon is unchanged but the mesh height must update).
                if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
                break;
            }

            // =================================================================
            // RESOLVE_INTERSECTIONS — Tự động xử lý giao điểm của tường mới
            // =================================================================
            // Use case: Khi người dùng vẽ xong một tường, lệnh này kiểm tra xem
            // tường mới có cắt qua tường nào đã có không. Nếu có, cả hai tường
            // đều được chia tại điểm giao (tạo thành ngã tư / ngã ba tường).
            //
            // THUẬT TOÁN:
            //   1. Với mỗi tường đang tồn tại (trừ tường mới):
            //      a. Bỏ qua nếu hai tường chia sẻ node (chúng kết nối, không "cắt").
            //      b. Tính giao điểm 2 đoạn thẳng (XZ plane) bằng parameterized form.
            //      c. Nếu giao điểm nằm TRONG cả hai đoạn (0 < t,s < 1), lưu lại.
            //   2. Sort các giao điểm theo t (từ startNode đến endNode của tường mới).
            //   3. Với mỗi giao điểm (theo thứ tự):
            //      a. Tạo newNode tại điểm giao.
            //      b. SPLIT_WALL cho tường cũ tại điểm giao.
            //      c. SPLIT_WALL cho tường mới (currentWallId) tại điểm giao.
            //      d. currentWallId ← maxWallIdRef.value (nửa sau của tường mới).
            //
            // TẠI SAO PHẢI SORT THEO t?
            //   Sau mỗi lần SPLIT_WALL, nửa sau của tường mới trở thành
            //   currentWallId. Nếu không sort, ta split tường ở điểm xa trước
            //   rồi split điểm gần → nửa sau sẽ không chứa điểm gần nữa.
            //   Sort từ nhỏ đến lớn (từ start đến end) đảm bảo mỗi lần split
            //   currentWallId luôn là nửa chưa được xử lý.
            //
            // TOÁN HỌC (Line-Line Intersection):
            //   Tường mới:  P(t) = sn + t * u   (t ∈ [0,1], u = en - sn)
            //   Tường cũ:   Q(s) = p1 + s * v   (s ∈ [0,1], v = p2 - p1)
            //   Giao điểm khi P(t) = Q(s):
            //     denom = ux*vz - uz*vx   (cross product của hai direction vectors)
            //     t = (vx*wz - vz*wx) / denom   (w = sn - p1)
            //     s = (ux*wz - uz*wx) / denom
            //   Nếu denom ≈ 0: hai tường song song hoặc trùng nhau → skip.
            //   EPS = 1e-4: loại bỏ giao điểm tại endpoint (đã được xử lý bởi MERGE_NODE).
            //
            // WARNING: RESOLVE_INTERSECTIONS gọi dispatch() đệ quy (gọi SPLIT_WALL
            //          qua dispatch chính nó). Điều này an toàn vì SPLIT_WALL không
            //          gọi lại RESOLVE_INTERSECTIONS. Nếu sau này thêm logic gọi
            //          RESOLVE_INTERSECTIONS trong SPLIT_WALL, sẽ có vòng lặp vô hạn.
            //
            // WARNING: maxWallIdRef.value phải được cập nhật TRONG SPLIT_WALL trước
            //          khi RESOLVE_INTERSECTIONS đọc để lấy ID tiếp theo. Thứ tự này
            //          hiện tại đúng nhưng dễ bị phá vỡ khi refactor.
            //
            // TODO: Xem xét đổi từ đệ quy dispatch sang iterative để dễ debug,
            //       tránh hidden control flow, và tránh stack overflow trên floor
            //       plan phức tạp có hàng trăm giao điểm.
            case "RESOLVE_INTERSECTIONS": {
                const newEnt = wallEntityByWallId.get(command.wallId);
                if (newEnt == null) break;
                const newWn = world.getComponent(newEnt, WallNodes);
                if (!newWn) break;

                const sn = nodeRegistry.get(newWn.startNodeId);
                const en = nodeRegistry.get(newWn.endNodeId);
                if (!sn || !en) break;

                // EPS: ngưỡng loại bỏ giao điểm tại endpoint (t ≈ 0 hoặc t ≈ 1).
                // Tại endpoint, hai tường kết nối — đây là "junction", không phải "intersection".
                // MERGE_NODE xử lý junction, không phải RESOLVE_INTERSECTIONS.
                const EPS = 1e-4;

                // Định nghĩa kiểu nội bộ cho intersection point.
                type IXPoint = { t: number; existingWallId: number; x: number; z: number };
                const intersections: IXPoint[] = [];

                // Direction vector của tường mới (chưa normalize — dùng parameterized form).
                const ux = en.x - sn.x, uz = en.z - sn.z;

                // Duyệt tất cả tường hiện có để tìm giao điểm.
                for (const [wid, ent] of wallEntityByWallId) {
                    if (wid === command.wallId) continue; // Bỏ qua tường mới

                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) continue;

                    // Bỏ qua tường đã chia sẻ node với tường mới.
                    // Tường chia sẻ node = kết nối tại endpoint → không "cắt nhau" theo nghĩa geometric.
                    const sharesNode =
                        wn.startNodeId === newWn.startNodeId ||
                        wn.endNodeId   === newWn.startNodeId ||
                        wn.startNodeId === newWn.endNodeId   ||
                        wn.endNodeId   === newWn.endNodeId;
                    if (sharesNode) continue;

                    const p1 = nodeRegistry.get(wn.startNodeId);
                    const p2 = nodeRegistry.get(wn.endNodeId);
                    if (!p1 || !p2) continue;

                    // Direction vector của tường cũ.
                    const vx = p2.x - p1.x, vz = p2.z - p1.z;
                    // Vector từ p1 đến sn (điểm bắt đầu tường mới).
                    const wx = sn.x - p1.x, wz = sn.z - p1.z;

                    // Cross product 2D: denom = u × v.
                    // Nếu denom ≈ 0, hai tường song song hoặc collinear → không có giao điểm.
                    const denom = ux * vz - uz * vx;
                    if (Math.abs(denom) < 1e-8) continue;

                    // Tính tham số t (trên tường mới) và s (trên tường cũ).
                    const t = (vx * wz - vz * wx) / denom;
                    const s = (ux * wz - uz * wx) / denom;

                    // Giao điểm hợp lệ nếu nằm TRONG cả hai đoạn (loại bỏ endpoint bằng EPS).
                    if (t > EPS && t < 1 - EPS && s > EPS && s < 1 - EPS) {
                        intersections.push({ t, existingWallId: wid, x: sn.x + t * ux, z: sn.z + t * uz });
                    }
                }

                if (intersections.length === 0) break; // Không có giao điểm → done

                // Sort từ start đến end của tường mới để đảm bảo split đúng thứ tự.
                intersections.sort((a, b) => a.t - b.t);

                // currentWallId track "nửa sau" của tường mới sau mỗi lần split.
                // Ban đầu = tường mới nguyên vẹn.
                let currentWallId = command.wallId;

                for (const ix of intersections) {
                    // Tạo node mới tại điểm giao (chưa kết nối với tường nào).
                    const newNodeId = nodeRegistry.createNode(ix.x, ix.z);

                    // Split tường cũ tại điểm giao.
                    // Sau SPLIT_WALL này, maxWallIdRef.value = newWallId của tường cũ.
                    dispatch({ type: "SPLIT_WALL", originalWallId: ix.existingWallId, newWallId: maxWallIdRef.value + 1, newNodeId, x: ix.x, z: ix.z });

                    // Split currentWallId (tường mới hoặc nửa sau của lần split trước).
                    // Sau SPLIT_WALL này, maxWallIdRef.value = newWallId của tường mới.
                    dispatch({ type: "SPLIT_WALL", originalWallId: currentWallId,      newWallId: maxWallIdRef.value + 1, newNodeId, x: ix.x, z: ix.z });

                    // currentWallId ← ID của nửa sau vừa tạo ra.
                    // Giao điểm tiếp theo (nếu có) sẽ split trên đoạn này.
                    currentWallId = maxWallIdRef.value;
                }
                break;
            }
        }
    }

    // Trả về hàm dispatch — đây là public interface duy nhất của dispatcher.
    // Caller (engine loop, UI handler) chỉ biết về hàm này, không biết về
    // world, nodeRegistry, hay bất kỳ dependency nào bên trong.
    return dispatch;
}
