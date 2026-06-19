/**
 * useGroupDrag — KÉO NHÓM (multi-select) tách khỏi useFurnitureDrag (Phase 5.5).
 *
 * Phương án B: cụm RIGID dời theo 1 delta; CHẶN TƯỜNG (mọi thành viên), nhưng CHO chồng đồ.
 * Toán kiểm tường (`groupHitsWall`) là thuần — đã tách + unit-test ở `furnitureGroupDrag.ts`.
 * Hook này giữ phần imperative (đọc/ghi Konva node) + state gesture (`groupDragRef`).
 *
 * Composer rẽ nhánh bằng `active()` (sau wall-item, trước single) — đừng đổi thứ tự.
 */
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";

import { groupHitsWall } from "src/app/features/plan2d/hooks/furnitureGroupDrag";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Furniture2D, Wall2D } from "src/app/features/plan2d/types";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

type Deps = {
    furniture: Furniture2D[];
    walls: Wall2D[];
    transform: PlanTransform;
    /** Tập object/furniture đang chọn (multi-select) — quyết định kéo nhóm. */
    selectedFurnitureIds: Set<string>;
    /** Map entityId → Konva.Group của các node đang render — dời các vật anh em khi kéo nhóm. */
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
    dispatch: (cmd: EngineCommand) => void;
    /** Gói nhiều dispatch thành 1 entry undo (snapshot) — dùng cho group-move. */
    withTransaction: (label: string, fn: () => void) => void;
};

export type GroupDrag = {
    /** onDragStart (nhánh floor): dựng groupDragRef nếu leader nằm trong multi-selection đặt sàn (>1). */
    tryStart: (f: Furniture2D) => void;
    /** Đang trong gesture kéo nhóm? */
    active: () => boolean;
    /** onDragMove: cụm rigid theo con trỏ leader, chặn tường. */
    follow: (leaderNode: Konva.Group) => void;
    /** onDragEnd: chốt 1 transaction = 1 undo theo lastGoodDelta (đã clamp tường). */
    end: (node: Konva.Group) => void;
};

export function useGroupDrag(deps: Deps): GroupDrag {
    const { furniture, walls, transform, selectedFurnitureIds, furnitureNodeRefs, dispatch, withTransaction } = deps;

    /**
     * Trạng thái kéo NHÓM. null = không kéo nhóm. Phương án B: cụm RIGID dời theo 1 delta;
     * CHẶN TƯỜNG (mọi thành viên), nhưng CHO chồng đồ.
     *   - leaderOriginPx: px của leader lúc bắt đầu (để tính raw delta theo con trỏ).
     *   - members: mọi đồ ĐẶT SÀN trong selection (gồm leader) — px gốc + cỡ + góc, để
     *     dựng OBB kiểm va chạm tường tại vị trí ứng viên.
     *   - lastGoodDelta: delta hợp lệ gần nhất (không vật nào đụng tường) — revert về đây
     *     khi delta ứng viên làm bất kỳ vật chạm tường (discrete clamp, như single-drag).
     */
    const groupDragRef = useRef<{
        leaderOriginPx: { x: number; y: number };
        members: { id: string; originX: number; originY: number; width: number; depth: number; rotDeg: number }[];
        lastGoodDelta: { dx: number; dy: number };
    } | null>(null);

    /**
     * Cụm RIGID dời theo con trỏ leader, CHẶN TƯỜNG (phương án B). Đọc groupDragRef; no-op
     * khi kéo đơn. Đặt vị trí imperative cho MỌI thành viên (gồm leader) → giữ layout tương đối.
     *   - raw delta = leader hiện tại − leaderOrigin.
     *   - nếu raw delta khiến vật nào chạm tường → giữ lastGoodDelta (cả cụm "dừng" ở tường).
     *     Ngược lại nhận raw delta và lưu lại. KHÔNG kiểm va chạm đồ (cho chồng tạm).
     */
    function follow(leaderNode: Konva.Group): void {
        const g = groupDragRef.current;
        if (!g) return;
        const rawDx = leaderNode.x() - g.leaderOriginPx.x;
        const rawDy = leaderNode.y() - g.leaderOriginPx.y;
        const blocked = groupHitsWall(g.members, rawDx, rawDy, walls);
        const dx = blocked ? g.lastGoodDelta.dx : rawDx;
        const dy = blocked ? g.lastGoodDelta.dy : rawDy;
        if (!blocked) g.lastGoodDelta = { dx: rawDx, dy: rawDy };
        let layer: Konva.Layer | null = null;
        for (const m of g.members) {
            const node = furnitureNodeRefs.current.get(m.id);
            if (!node) continue;
            node.position({ x: m.originX + dx, y: m.originY + dy });
            layer = node.getLayer();
        }
        layer?.batchDraw();
    }

    function tryStart(f: Furniture2D): void {
        // Kéo nhóm: chỉ khi leader nằm trong multi-selection (>1). Gom MỌI đồ ĐẶT SÀN
        // trong selection (gồm leader, loại wall-item) kèm cỡ + góc để kiểm va chạm tường.
        if (selectedFurnitureIds.size > 1 && selectedFurnitureIds.has(f.entityId)) {
            const members: { id: string; originX: number; originY: number; width: number; depth: number; rotDeg: number }[] = [];
            for (const id of selectedFurnitureIds) {
                const node = furnitureNodeRefs.current.get(id);
                const target = furniture.find(x => x.entityId === id);
                if (!node || !target || target.isWallItem) continue;
                members.push({ id, originX: node.x(), originY: node.y(), width: target.width, depth: target.depth, rotDeg: target.rotDeg });
            }
            // Cần >1 (leader + ít nhất 1 anh em đặt sàn) mới là group-move.
            groupDragRef.current = members.length > 1
                ? { leaderOriginPx: { x: f.x, y: f.y }, members, lastGoodDelta: { dx: 0, dy: 0 } }
                : null;
        } else {
            groupDragRef.current = null;
        }
    }

    function active(): boolean {
        return groupDragRef.current !== null;
    }

    function end(node: Konva.Group): void {
        const group = groupDragRef.current;
        groupDragRef.current = null;
        if (!group) return;
        // Group-move (B): chốt theo lastGoodDelta (delta đã clamp tường). Chạy
        // applyGroupFollow 1 nhịp cuối để gộp cử động cuối trước khi đọc delta.
        // force=true: engine bỏ snap+collision → giữ layout tương đối + cho chồng đồ
        // (UI đã đảm bảo không vật nào qua tường). 1 transaction = 1 undo, KHÔNG record lẻ.
        follow(node);
        const { dx, dy } = group.lastGoodDelta;
        withTransaction("move selection 2D", () => {
            for (const m of group.members) {
                dispatch({
                    type: "MOVE_FURNITURE",
                    entityId: m.id,
                    x: transform.toWorldX(m.originX + dx),
                    z: transform.toWorldZ(m.originY + dy),
                    force: true,
                });
            }
        });
    }

    return { tryStart, active, follow, end };
}
