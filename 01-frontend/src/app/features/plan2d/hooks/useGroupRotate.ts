/**
 * useGroupRotate — XOAY NHÓM (multi-select) tách khỏi useFurnitureDrag (Phase 5.5).
 *
 * Transformer xoay cả cụm quanh pivot → mỗi node đổi CẢ rotation lẫn position. Commit MỘT
 * lần cho toàn nhóm (các fire sau no-op nhờ groupTransformCommittedRef). CHẶN TƯỜNG: nếu BẤT
 * KỲ vật nào sau khi xoay chạm tường → HỦY cả phép xoay (revert node, không dispatch) — nhất
 * quán với single-rotate (bị chặn thì giữ góc cũ). Cho chồng đồ (chỉ kiểm tường). force=true.
 *
 * Toán kiểm tường (`memberPoseHitsWall`) thuần — đã tách + unit-test ở `furnitureGroupDrag.ts`.
 */
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";

import { konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { snapAngleRad } from "src/shared/constants/placement";
import { memberPoseHitsWall } from "src/app/features/plan2d/hooks/furnitureGroupDrag";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Furniture2D, Wall2D } from "src/app/features/plan2d/types";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

type Deps = {
    furniture: Furniture2D[];
    walls: Wall2D[];
    transform: PlanTransform;
    selectedFurnitureIds: Set<string>;
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
    dispatch: (cmd: EngineCommand) => void;
    withTransaction: (label: string, fn: () => void) => void;
};

export type GroupRotate = {
    /**
     * onTransformEnd (nhánh group): commit/hủy phép xoay nhóm.
     * @returns true nếu đây là xoay nhóm (đã xử lý) → composer dừng, không chạy single-rotate.
     */
    tryCommit: (f: Furniture2D) => boolean;
};

export function useGroupRotate(deps: Deps): GroupRotate {
    const { furniture, walls, transform, selectedFurnitureIds, furnitureNodeRefs, dispatch, withTransaction } = deps;

    /**
     * Chống commit lặp khi xoay NHÓM: Konva Transformer fire `transformend` cho TỪNG
     * node được gắn (N lần/gesture). Cờ true sau lần đầu, reset ở microtask kế (sau khi
     * cụm N event đồng bộ chạy xong) để gesture sau commit lại được.
     */
    const groupTransformCommittedRef = useRef(false);

    function tryCommit(f: Furniture2D): boolean {
        if (!(selectedFurnitureIds.size > 1 && selectedFurnitureIds.has(f.entityId))) return false;
        if (groupTransformCommittedRef.current) return true;
        groupTransformCommittedRef.current = true;
        queueMicrotask(() => { groupTransformCommittedRef.current = false; });

        // Gom pose sau xoay (đã snap góc) + kiểm tường cho từng thành viên.
        const poses: { id: string; rotY: number; px: number; py: number }[] = [];
        let hitsWall = false;
        for (const id of selectedFurnitureIds) {
            const target = furniture.find(x => x.entityId === id);
            const sib = furnitureNodeRefs.current.get(id);
            if (!target || !sib || target.isWallItem) continue;
            const rotY = snapAngleRad(konvaDegToThreeRotY(sib.rotation()));
            const rotDeg = threeRotYToKonvaDeg(rotY);
            if (memberPoseHitsWall({ x: sib.x(), y: sib.y(), width: target.width, depth: target.depth, rotDeg }, walls)) { hitsWall = true; break; }
            poses.push({ id, rotY, px: sib.x(), py: sib.y() });
        }

        if (hitsWall) {
            // Hủy: trả mọi node về tư thế trước xoay (từ snapshot furniture).
            for (const id of selectedFurnitureIds) {
                const target = furniture.find(x => x.entityId === id);
                const sib = furnitureNodeRefs.current.get(id);
                if (!target || !sib) continue;
                sib.position({ x: target.x, y: target.y });
                sib.rotation(target.rotDeg);
                sib.getLayer()?.batchDraw();
            }
            return true;
        }

        withTransaction("rotate selection 2D", () => {
            for (const p of poses) {
                furnitureNodeRefs.current.get(p.id)?.rotation(threeRotYToKonvaDeg(p.rotY));
                dispatch({ type: "ROTATE_FURNITURE", entityId: p.id, rotY: p.rotY, force: true });
                dispatch({ type: "MOVE_FURNITURE", entityId: p.id, x: transform.toWorldX(p.px), z: transform.toWorldZ(p.py), force: true });
            }
        });
        return true;
    }

    return { tryCommit };
}
