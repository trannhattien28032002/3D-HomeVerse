/**
 * deserializeScene — xoá scene hiện tại và dựng lại từ một SceneDocument bằng
 * cách dispatch các command engine chuẩn.
 *
 * Chiến lược:
 *  1. Chụp tất cả wallId hiện tại (Map bị mutate trong lúc xoá).
 *  2. Dispatch REMOVE_WALL cho từng tường — dispatcher tự xoá node mồ côi.
 *  3. Dispatch ENSURE_NODE cho mọi node trong document.
 *  4. Dispatch ADD_WALL cho mọi tường trong document.
 *
 * Vì sao dùng command dispatcher (không mutate ECS trực tiếp):
 *  - Mọi validation và side-effect (recompute AABB, invalidate polygon...) đi qua
 *    đúng các đường mà thao tác chỉnh sửa bình thường của người dùng đi qua.
 *  - Node/wall id là uuid bền vững trong document — không cần đồng bộ counter nào.
 *
 * Vì sao KHÔNG dispatch RESOLVE_INTERSECTIONS:
 *  - Scene đã lưu vốn nhất quán topology. Chạy lại phân giải giao cắt sẽ tạo thêm
 *    node/wall không có trong document → hỏng dữ liệu khi nạp.
 *
 * Node cô lập (không nối tường nào) được giữ lại — chúng do ENSURE_NODE tạo và ở
 * lại trong registry. Khớp với hành vi serialize (vốn lưu mọi node của registry).
 */

import type { EngineInstance } from "src/engine/engineTypes";
import type { SceneDocument } from "./SceneDocument";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { Query } from "src/engine/ecs/Query";
import { DEFAULT_WALL_HEIGHT } from "src/shared/constants/wall";

/**
 * Generation token (C1) — tăng mỗi lần deserializeScene được gọi. Mỗi lần chạy chụp
 * giá trị này vào biến local `myGen`; trước mỗi lần spawn GLB (async) ta kiểm tra
 * `myGen === _generation`. Nếu một deserialize MỚI đã bắt đầu (undo/redo nhanh liên
 * tiếp) thì _generation đã tăng → lần chạy cũ dừng ngay, không spawn tiếp vào scene
 * đã bị lần mới xoá sạch. Cùng nguyên lý với guard `this.modelId !== modelId` trong
 * FurniturePlacementSystem.begin().
 */
let _generation = 0;

/**
 * Callback tiến độ nạp scene. `loaded`/`total` đếm số item nặng (furniture +
 * wall-item) đã spawn xong — đây là phần async thật (tải + parse GLB). Node/tường
 * dựng đồng bộ nên không tính vào tiến độ. `total === 0` ⇒ scene không có item nào
 * cần tải (consumer nên coi như 100%).
 */
export type DeserializeProgress = (loaded: number, total: number) => void;

/**
 * Dựng lại scene từ SceneDocument. ASYNC (C1): furniture/wall-item được spawn qua
 * `dispatchAsync` và await TUẦN TỰ — thay cho fire-and-forget sync `dispatch` cũ
 * (vốn in cảnh báo "undo will NOT be undo-safe" và để promise GLB chạy tự do).
 *
 * Nhờ vậy luồng thường (nạp file, undo/redo một bước) là tất định và undo-safe:
 * mọi entity đã tồn tại khi promise resolve, không có spawn chồng giữa hai scene.
 *
 * Race còn lại (rất hẹp): nếu một deserialize mới chen vào đúng lúc một promise GLB
 * chưa-cache của lần cũ đang bay, lần cũ có thể spawn TỐI ĐA một entity sót trước khi
 * generation guard chặn — so với hành vi cũ (interleave nhiều entity). Trade-off chấp
 * nhận được; đóng hẳn cần generation token luồn xuống tận FurnitureFactory.
 *
 * `onProgress` (optional): được gọi sau mỗi item spawn xong để host (LoadingScreen)
 * hiển thị tiến độ thật. Caller undo/redo/file-load bỏ qua tham số này.
 */
export async function deserializeScene(
    doc: SceneDocument,
    engine: EngineInstance,
    onProgress?: DeserializeProgress,
): Promise<void> {
    const myGen = ++_generation;
    const dispatch = engine.api.dispatch;
    const dispatchAsync = engine.api.dispatchAsync;

    // ── 1. Xoá scene hiện tại ─────────────────────────────────────────────────
    // Xoá toàn bộ furniture trước (chụp entity id trước khi lặp — world bị
    // mutate bởi mỗi lần dispatch DELETE_FURNITURE).
    const existingFurniture = [...Query.entitiesWith(engine.world, FurnitureTag)];
    for (const entityId of existingFurniture) {
        dispatch({ type: "DELETE_FURNITURE", entityId });
    }

    // Chụp wallId trước — Map bị mutate bởi mỗi lần dispatch REMOVE_WALL.
    const existingWallIds = [...engine.wallEntityByWallId.keys()];
    for (const wallId of existingWallIds) {
        dispatch({ type: "REMOVE_WALL", wallId });
    }

    // Xoá registry material sàn — nếu không, entry cũ còn sót sẽ bị RoomSystem áp lại
    // sau khi phòng được phát hiện lại (làm hỏng undo và lúc nạp scene mới).
    // doc.floors (bước 6) sẽ nạp lại đúng tập material.
    engine.floorMaterials.clear();

    // ── 2. Khôi phục node ─────────────────────────────────────────────────────
    // Mọi node phải tồn tại trước khi dispatch bất kỳ ADD_WALL nào.
    for (const node of doc.nodes) {
        dispatch({ type: "ENSURE_NODE", nodeId: node.id, x: node.x, z: node.z });
    }

    // ── 3. Khôi phục tường ────────────────────────────────────────────────────
    for (const wall of doc.walls) {
        dispatch({
            type: "ADD_WALL",
            wallId: wall.wallId,
            startNodeId: wall.startNodeId,
            endNodeId: wall.endNodeId,
            thickness: wall.thickness,
        });

        // Khôi phục chiều cao tường nếu khác mặc định factory (DEFAULT_WALL_HEIGHT).
        // ADD_WALL luôn tạo tường ở chiều cao mặc định; UPDATE_WALL là command
        // đúng để ghi đè mà không cần chu trình rebuild mesh.
        if (Math.abs(wall.height - DEFAULT_WALL_HEIGHT) > 1e-4) {
            dispatch({ type: "UPDATE_WALL", wallId: wall.wallId, height: wall.height });
        }

        // Khôi phục material bề mặt tường RIÊNG từng mặt. ADD_WALL tạo Mesh đồng bộ
        // (WallFactory) nên SET_WALL_MATERIAL áp được ngay; material giữ qua rebuild sau.
        // File cũ chỉ có `material` đơn → map thành CẢ 2 mặt (giữ diện mạo cũ).
        const faces = wall.materialFaces ?? (wall.material ? { left: wall.material, right: wall.material } : undefined);
        if (faces?.left) dispatch({ type: "SET_WALL_MATERIAL", wallId: wall.wallId, materialId: faces.left, face: "left" });
        if (faces?.right) dispatch({ type: "SET_WALL_MATERIAL", wallId: wall.wallId, materialId: faces.right, face: "right" });
    }

    // ── 4. Khôi phục furniture ────────────────────────────────────────────────
    // dispatchAsync + await tuần tự: entity tồn tại xong mới sang item kế. Guard
    // generation trước mỗi spawn để dừng nếu một deserialize mới đã chen vào (C1).
    const furniture = doc.furniture ?? [];
    const wallItems = doc.wallItems ?? [];
    const total = furniture.length + wallItems.length;
    let loaded = 0;
    onProgress?.(0, total);

    for (const f of furniture) {
        if (myGen !== _generation) return;
        await dispatchAsync({ type: "PLACE_FURNITURE", modelId: f.modelId, x: f.x, y: f.y, z: f.z, rotY: f.rotY, materials: f.materials });
        onProgress?.(++loaded, total);
    }

    // ── 5. Khôi phục đồ bám tường ─────────────────────────────────────────────
    // Phải SAU khi tường được tạo (bước 3) vì PLACE_WALL_ITEM suy Transform từ
    // topology tường theo hostWallId. Cũng await tuần tự + guard generation.
    for (const w of wallItems) {
        if (myGen !== _generation) return;
        await dispatchAsync({ type: "PLACE_WALL_ITEM", modelId: w.modelId, hostWallId: w.hostWallId, t: w.t, side: w.side, materials: w.materials });
        onProgress?.(++loaded, total);
    }

    // ── 6. Khôi phục material sàn ─────────────────────────────────────────────
    // SET_FLOOR_MATERIAL ghi vào registry roomKey→materialId; RoomSystem re-apply
    // khi dựng lại mesh sàn (phòng được phát hiện sau khi tường tồn tại). Ghi registry
    // bền nên thứ tự với việc phát hiện phòng không quan trọng.
    if (myGen !== _generation) return;
    for (const [roomKey, materialId] of Object.entries(doc.floors ?? {})) {
        dispatch({ type: "SET_FLOOR_MATERIAL", roomKey, materialId });
    }
}
