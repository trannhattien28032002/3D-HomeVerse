/**
 * useFurnitureDrag — COMPOSER drag/rotate cho FurnitureLayer (R7 → chẻ ở Phase 5.5).
 *
 * Hook này giờ chỉ giữ:
 *   - Refs Konva dùng chung: guideRef (đường gióng), collideRef (ô đỏ báo chồng).
 *   - Imperative helpers dùng chung: showCollide, renderGuide.
 *   - SINGLE-DRAG furniture-thường: applyFurnitureDrag (snap + hard-collision) + lastSafePos.
 *   - SINGLE-ROTATE: nhánh đơn của onTransformEnd.
 *   - 4 handler orchestrator rẽ nhánh theo gesture, ĐÚNG THỨ TỰ: wall-item → group → single.
 *
 * 3 gesture còn lại tách sang hook con (mỗi cái sở hữu state riêng):
 *   - useWallItemDrag  (kéo cửa/kệ)         — pendingWallMoveRef, dragFromWallRef
 *   - useGroupDrag     (kéo nhóm)           — groupDragRef
 *   - useGroupRotate   (xoay nhóm)          — groupTransformCommittedRef
 *
 * Invariants:
 *   - Không import React component nào; chỉ phụ thuộc Konva/plan2d/shared/engine utils.
 *   - Thứ tự rẽ nhánh trong onDragMove/End/onTransformEnd PHẢI giữ nguyên (feel-sensitive).
 */
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import { konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { snapAngleRad } from "src/shared/constants/placement";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { obbCorners, collidesWithWalls } from "src/app/components/editor/tools/collision2D";
import { buildFurnitureBoxes2D } from "src/app/features/plan2d/wallSegments2D";
import { useWallItemDrag } from "src/app/features/plan2d/hooks/useWallItemDrag";
import { useGroupDrag } from "src/app/features/plan2d/hooks/useGroupDrag";
import { useGroupRotate } from "src/app/features/plan2d/hooks/useGroupRotate";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Furniture2D, Wall2D, Node2D } from "src/app/features/plan2d/types";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

export type FurnitureDragHandlers = {
    onDragStart: (f: Furniture2D) => void;
    onDragMove: (e: KonvaEventObject<MouseEvent>, f: Furniture2D) => void;
    onDragEnd: (e: KonvaEventObject<MouseEvent>, f: Furniture2D) => void;
    onTransformEnd: (e: KonvaEventObject<Event>, f: Furniture2D) => void;
    /** Refs da muốn gắn vào Konva nodes — component truyền vào ref={...} */
    guideRef: MutableRefObject<Konva.Line | null>;
    collideRef: MutableRefObject<Konva.Rect | null>;
};

type Params = {
    furniture: Furniture2D[];
    transform: PlanTransform;
    wallSegments: WallSegment[];
    walls: Wall2D[];
    nodeById: Map<string, Node2D>;
    dragTransactionOpenRef: MutableRefObject<boolean>;
    dispatch: (cmd: EngineCommand) => void;
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
    /** Check va chạm 3D với đồ khác (loại tường) ở Y thật — thay cho SAT-2D không có Y. */
    wouldFurnitureCollide: (entityId: string, worldX: number, worldZ: number) => boolean;
    /** Tập object/furniture đang chọn (multi-select) — quyết định kéo nhóm. */
    selectedFurnitureIds: Set<string>;
    /** Map entityId → Konva.Group của các node đang render — dời các vật anh em khi kéo nhóm. */
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
    /** Gói nhiều dispatch thành 1 entry undo (snapshot) — dùng cho group-move. */
    withTransaction: (label: string, fn: () => void) => void;
};

/**
 * useFurnitureDrag — drag/rotate orchestrator cho FurnitureLayer.
 *
 * Trả về handlers (onDragStart/Move/End, onTransformEnd) và guideRef/collideRef
 * mà FurnitureLayer cần gắn vào Konva nodes tương ứng.
 */
export function useFurnitureDrag({
    furniture, transform,
    wallSegments, walls, nodeById,
    dragTransactionOpenRef,
    dispatch, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
    wouldFurnitureCollide,
    selectedFurnitureIds, furnitureNodeRefs, withTransaction,
}: Params): FurnitureDragHandlers {
    // ── Imperative Konva refs (dùng chung) ────────────────────────────────────
    const guideRef   = useRef<Konva.Line | null>(null);
    const collideRef = useRef<Konva.Rect | null>(null);

    // ── Single-drag state refs ─────────────────────────────────────────────────
    /** Vị trí px hợp lệ gần nhất của furniture-thường đang kéo (để "dừng" vật khi đụng). */
    const lastSafePosRef = useRef<{ x: number; y: number } | null>(null);
    /** Neighbor boxes (đồ KHÁC) — bất biến trong 1 gesture nên gom 1 lần ở onDragStart. */
    const neighborBoxesRef = useRef<FurnitureBox[] | null>(null);
    /** Vị trí world-space TRƯỚC khi kéo (cho command-inverse undo, R3). */
    const dragFromPosRef = useRef<{ x: number; z: number } | null>(null);

    // ── Imperative helpers (dùng chung wall-item + floor) ──────────────────────

    /** Hiện/ẩn ô đỏ báo chồng lấn tại vị trí cửa đang kéo. */
    function showCollide(at: { cx: number; cy: number; rotDeg: number } | null, f: Furniture2D): void {
        const r = collideRef.current;
        if (!r) return;
        if (at) {
            r.position({ x: at.cx, y: at.cy });
            r.rotation(at.rotDeg);
            r.size({ width: f.width, height: f.depth });
            r.offsetX(f.width / 2);
            r.offsetY(f.depth / 2);
            r.visible(true);
        } else {
            r.visible(false);
        }
        r.getLayer()?.batchDraw();
    }

    function renderGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        const line = guideRef.current;
        if (!line) return;
        if (guides.length > 0) {
            const g = guides[0];
            line.points([
                transform.toPxX(g.x1), transform.toPxY(g.z1),
                transform.toPxX(g.x2), transform.toPxY(g.z2),
            ]);
            line.visible(true);
        } else {
            line.visible(false);
        }
        line.getLayer()?.batchDraw();
    }

    // ── Gesture hooks con ──────────────────────────────────────────────────────
    const wallItem = useWallItemDrag({
        furniture, walls, nodeById, transform, dispatch, recordWallItemMoveUndo, showCollide,
    });
    const group = useGroupDrag({
        furniture, walls, transform, selectedFurnitureIds, furnitureNodeRefs, dispatch, withTransaction,
    });
    const groupRotate = useGroupRotate({
        furniture, walls, transform, selectedFurnitureIds, furnitureNodeRefs, dispatch, withTransaction,
    });

    // ── Single floor-furniture drag ────────────────────────────────────────────

    /**
     * Kéo furniture-thường: snap (edge + wall) qua resolveAlignment, rồi check
     * HARD-collision (tường + đồ khác) như 3D.
     *   - Trống → node "teleport" tới vị trí intended, cập nhật lastSafe, ẩn ô đỏ.
     *   - Đụng → node GIỮ ở lastSafe (vật dừng lại), ô đỏ trôi theo con trỏ (intended).
     * Trả về world coords ĐÃ commit lên node để onDragEnd dispatch MOVE_FURNITURE.
     */
    function applyFurnitureDrag(node: Konva.Group, f: Furniture2D): { x: number; z: number } {
        const pos = node.position();
        // ⭐ SEAM CHUNG furniture-translate (Phase 5.3): `resolveAlignment` dùng CHUNG với
        // đường 3D (gizmoHandles.handleFurnitureTranslate) — cùng nguồn snap, kết quả {x,z}
        // world khớp nhau. Phần SAU seam KHÁC backend có chủ đích (không gộp, xem PHASE5
        // §5.3): 2D dùng SAT miter-poly (không trục Y) + wouldFurnitureCollide + lastSafePos;
        // 3D dùng Cannon sweep (có Y) + dragGhost.
        const r = resolveAlignment({
            cx: transform.toWorldX(pos.x),
            cz: transform.toWorldZ(pos.y),
            hw: f.width / (2 * transform.scale),
            hd: f.depth / (2 * transform.scale),
            rotY: konvaDegToThreeRotY(f.rotDeg),
            walls: wallSegments,
            neighbors: neighborBoxesRef.current ?? buildFurnitureBoxes2D(furniture, transform, f.entityId),
        });
        // intendedX/intendedY = `r.x/r.z` (world) đổi sang px Konva — tương ứng `ix/iz` của 3D.
        const intendedX = transform.toPxX(r.x);
        const intendedY = transform.toPxY(r.z);

        const poly = obbCorners(intendedX, intendedY, f.width, f.depth, f.rotDeg);
        // Tường: SAT-2D miter-poly (full-height → trục Y vô nghĩa, giữ nguyên A1).
        // Đồ khác: hỏi check 3D của engine ở Y thật → vật xếp chồng (bàn phím trên bàn)
        // không bị tính chồng vì khác cao độ. Cùng nguồn Cannon với commit MOVE_FURNITURE.
        const colliding = collidesWithWalls(poly, walls) || wouldFurnitureCollide(f.entityId, r.x, r.z);

        if (!colliding) {
            node.position({ x: intendedX, y: intendedY });
            lastSafePosRef.current = { x: intendedX, y: intendedY };
            showCollide(null, f);
            renderGuide(r.guides);
            return { x: r.x, z: r.z };
        }
        const safe = lastSafePosRef.current ?? { x: f.x, y: f.y };
        node.position(safe);
        showCollide({ cx: intendedX, cy: intendedY, rotDeg: f.rotDeg }, f);
        renderGuide([]);
        return { x: transform.toWorldX(safe.x), z: transform.toWorldZ(safe.y) };
    }

    // ── Exported drag handlers (orchestrator rẽ nhánh) ─────────────────────────

    function onDragStart(f: Furniture2D): void {
        showCollide(null, f);
        lastSafePosRef.current = { x: f.x, y: f.y };
        if (f.isWallItem) {
            wallItem.start(f);
        } else {
            dragFromPosRef.current = { x: transform.toWorldX(f.x), z: transform.toWorldZ(f.y) };
            neighborBoxesRef.current = buildFurnitureBoxes2D(furniture, transform, f.entityId);
            group.tryStart(f);
        }
        dragTransactionOpenRef.current = true;
    }

    function onDragMove(e: KonvaEventObject<MouseEvent>, f: Furniture2D): void {
        if (f.isWallItem) {
            wallItem.project(e.target as Konva.Group, f);
            return;
        }
        const node = e.target as Konva.Group;
        // Kéo NHÓM (phương án B): cụm rigid theo con trỏ, CHẶN TƯỜNG (mọi thành viên),
        // CHO chồng đồ. KHÔNG đi applyFurnitureDrag (đó là clamp đơn, sẽ đụng chính sibling).
        if (group.active()) {
            group.follow(node);
            return;
        }
        applyFurnitureDrag(node, f);
    }

    function onDragEnd(e: KonvaEventObject<MouseEvent>, f: Furniture2D): void {
        dragTransactionOpenRef.current = false;
        const node = e.target as Konva.Group;
        if (f.isWallItem) {
            wallItem.end(node, f);
            return;
        }
        neighborBoxesRef.current = null;
        showCollide(null, f);
        renderGuide([]);
        if (group.active()) {
            group.end(node);
            dragFromPosRef.current = null;
            return;
        }
        const { x, z } = applyFurnitureDrag(node, f);
        const fromPos = dragFromPosRef.current;
        dragFromPosRef.current = null;
        dispatch({ type: "MOVE_FURNITURE", entityId: f.entityId, x, z });
        if (fromPos) {
            recordMoveUndo(f.entityId, fromPos.x, fromPos.z, x, z);
        }
    }

    function onTransformEnd(e: KonvaEventObject<Event>, f: Furniture2D): void {
        const node = e.target as Konva.Group;
        node.scaleX(1);
        node.scaleY(1);
        if (f.isWallItem) return;

        // Xoay NHÓM (multi-select) — phương án B. tryCommit trả true nếu đã xử lý nhóm.
        if (groupRotate.tryCommit(f)) return;

        // ── Xoay ĐƠN (đường cũ) ──────────────────────────────────────────────
        const fromRotY = konvaDegToThreeRotY(f.rotDeg);
        const rotY = snapAngleRad(konvaDegToThreeRotY(node.rotation()));
        node.rotation(threeRotYToKonvaDeg(rotY));
        dispatch({ type: "ROTATE_FURNITURE", entityId: f.entityId, rotY });
        recordRotateUndo(f.entityId, fromRotY, rotY);
    }

    return { onDragStart, onDragMove, onDragEnd, onTransformEnd, guideRef, collideRef };
}
