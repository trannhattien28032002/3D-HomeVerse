/**
 * useFurnitureDrag — hook tách biệt toàn bộ drag logic khỏi FurnitureLayer (R7).
 *
 * Chứa:
 *   - projectWallItem: chiếu cửa/kệ lên tường gần nhất (bám tường, tô đỏ khi chồng)
 *   - applyFurnitureDrag: snap (edge + wall) + hard-collision cho furniture thường
 *   - renderGuide: vẽ đường gióng wall-snap imperative lên Konva
 *   - showCollide: hiện/ẩn ô đỏ báo chồng lấn imperative
 *   - onDragStart / onDragMove / onDragEnd handlers (logic) — component chỉ spread vào Konva
 *
 * Tất cả ref/state imperative (guideRef, collideRef, pendingWallMoveRef, v.v.) nằm trong
 * hook này — FurnitureLayer chỉ render.
 *
 * Invariants:
 *   - Không import React component nào.
 *   - Chỉ phụ thuộc vào Konva types, plan2d types, shared geometry, và engine utils.
 *   - Unit-test được bằng cách mock các ref và kiểm tra kết quả dispatch.
 */
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import { konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { snapAngleRad } from "src/shared/constants/placement";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { obbCorners, collidesWithWalls } from "src/app/components/editor/tools/collision2D";
import { groupHitsWall, memberPoseHitsWall } from "src/app/features/plan2d/hooks/furnitureGroupDrag";
import { buildFurnitureBoxes2D } from "src/app/features/plan2d/wallSegments2D";
import { projectToNearestWall, buildOpeningOccupancy } from "src/app/features/plan2d/wallItemDrag2D";
import { buildOccupiedRanges, occupiedOverlaps } from "src/engine/utils/wallOccupancy";
import { occupancyLane } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
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
    // ── Imperative Konva refs ────────────────────────────────────────────────
    const guideRef   = useRef<Konva.Line | null>(null);
    const collideRef = useRef<Konva.Rect | null>(null);

    // ── Gesture state refs ───────────────────────────────────────────────────
    /** Lệnh move-wall-item dự kiến (null = đang chồng lấn → không commit). */
    const pendingWallMoveRef = useRef<{ entityId: string; hostWallId: string; t: number; side: number } | null>(null);
    /** Vị trí px hợp lệ gần nhất của furniture-thường đang kéo (để "dừng" vật khi đụng). */
    const lastSafePosRef = useRef<{ x: number; y: number } | null>(null);
    /** Neighbor boxes (đồ KHÁC) — bất biến trong 1 gesture nên gom 1 lần ở onDragStart. */
    const neighborBoxesRef = useRef<FurnitureBox[] | null>(null);
    /** Vị trí world-space TRƯỚC khi kéo (cho command-inverse undo, R3). */
    const dragFromPosRef = useRef<{ x: number; z: number } | null>(null);
    /** Wall-move trước khi kéo cửa (cho command-inverse undo, R3). */
    const dragFromWallRef = useRef<{ hostWallId: string; t: number; side: number } | null>(null);
    /**
     * Trạng thái kéo NHÓM (multi-select). null = kéo đơn (đường cũ). Phương án B:
     * cụm RIGID dời theo 1 delta; CHẶN TƯỜNG (mọi thành viên), nhưng CHO chồng đồ.
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
     * Chống commit lặp khi xoay NHÓM: Konva Transformer fire `transformend` cho TỪNG
     * node được gắn (N lần/gesture). Cờ true sau lần đầu, reset ở microtask kế (sau khi
     * cụm N event đồng bộ chạy xong) để gesture sau commit lại được.
     */
    const groupTransformCommittedRef = useRef(false);

    // ── Imperative helpers ───────────────────────────────────────────────────

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

    // ── Wall-item drag ───────────────────────────────────────────────────────

    /**
     * Kéo cửa: chiếu node lên tường gần nhất (free-drag → bám tường), GIỮ side hiện tại,
     * tô đỏ khi chồng opening khác hoặc khi cửa rời khỏi mọi tường.
     * Đặt node + rotation imperative để không re-render.
     */
    function projectWallItem(node: Konva.Group, f: Furniture2D): void {
        const pos = node.position();
        const worldX = transform.toWorldX(pos.x);
        const worldZ = transform.toWorldZ(pos.y);
        const footprintWidth = (f.cutWidthPx ?? f.width) / transform.scale;
        const proj = projectToNearestWall(walls, nodeById, worldX, worldZ, transform, footprintWidth, f.wallSide ?? 1, f.hostWallId, resolveWallItemDims(f.modelId));
        if (!proj) {
            pendingWallMoveRef.current = null;
            showCollide({ cx: pos.x, cy: pos.y, rotDeg: node.rotation() }, f);
            return;
        }

        node.position({ x: proj.cx, y: proj.cy });
        node.rotation(proj.rotDeg);

        const occ = buildOpeningOccupancy(furniture, proj.hostWallId, proj.wallLen, f.entityId);
        const lane = occupancyLane(f.wallBehavior ?? "mount", proj.side);
        const colliding = occupiedOverlaps(proj.t, proj.halfWidthT, lane, buildOccupiedRanges(occ));
        pendingWallMoveRef.current = colliding
            ? null
            : { entityId: f.entityId, hostWallId: proj.hostWallId, t: proj.t, side: proj.side };
        showCollide(colliding ? { cx: proj.cx, cy: proj.cy, rotDeg: proj.rotDeg } : null, f);
    }

    // ── Floor furniture drag ─────────────────────────────────────────────────

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

    // ── Group drag (multi-select) ─────────────────────────────────────────────

    /**
     * Cụm RIGID dời theo con trỏ leader, CHẶN TƯỜNG (phương án B). Đọc groupDragRef; no-op
     * khi kéo đơn. Đặt vị trí imperative cho MỌI thành viên (gồm leader) → giữ layout tương đối.
     *   - raw delta = leader hiện tại − leaderOrigin.
     *   - nếu raw delta khiến vật nào chạm tường → giữ lastGoodDelta (cả cụm "dừng" ở tường).
     *     Ngược lại nhận raw delta và lưu lại. KHÔNG kiểm va chạm đồ (cho chồng tạm).
     */
    function applyGroupFollow(leaderNode: Konva.Group): void {
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

    // ── Exported drag handlers ───────────────────────────────────────────────

    function onDragStart(f: Furniture2D): void {
        showCollide(null, f);
        lastSafePosRef.current = { x: f.x, y: f.y };
        if (f.isWallItem) {
            if (f.hostWallId !== undefined && f.wallT !== undefined && f.wallSide !== undefined) {
                dragFromWallRef.current = { hostWallId: f.hostWallId, t: f.wallT, side: f.wallSide };
            } else {
                dragFromWallRef.current = null;
            }
            dragFromPosRef.current = null;
        } else {
            dragFromPosRef.current = { x: transform.toWorldX(f.x), z: transform.toWorldZ(f.y) };
            dragFromWallRef.current = null;
            neighborBoxesRef.current = buildFurnitureBoxes2D(furniture, transform, f.entityId);
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
        dragTransactionOpenRef.current = true;
    }

    function onDragMove(e: KonvaEventObject<MouseEvent>, f: Furniture2D): void {
        if (f.isWallItem) {
            projectWallItem(e.target as Konva.Group, f);
            return;
        }
        const node = e.target as Konva.Group;
        // Kéo NHÓM (phương án B): cụm rigid theo con trỏ, CHẶN TƯỜNG (mọi thành viên),
        // CHO chồng đồ. KHÔNG đi applyFurnitureDrag (đó là clamp đơn, sẽ đụng chính sibling).
        if (groupDragRef.current) {
            applyGroupFollow(node);
            return;
        }
        applyFurnitureDrag(node, f);
    }

    function onDragEnd(e: KonvaEventObject<MouseEvent>, f: Furniture2D): void {
        dragTransactionOpenRef.current = false;
        const node = e.target as Konva.Group;
        if (f.isWallItem) {
            projectWallItem(node, f);
            showCollide(null, f);
            const pending = pendingWallMoveRef.current;
            pendingWallMoveRef.current = null;
            const fromWall = dragFromWallRef.current;
            dragFromWallRef.current = null;
            if (pending) {
                dispatch({ type: "MOVE_WALL_ITEM", ...pending });
                if (fromWall) {
                    recordWallItemMoveUndo(
                        pending.entityId,
                        fromWall.hostWallId, fromWall.t, fromWall.side,
                        pending.hostWallId, pending.t, pending.side,
                    );
                }
            } else {
                node.position({ x: f.x, y: f.y });
                node.rotation(f.rotDeg);
                node.getLayer()?.batchDraw();
            }
            return;
        }
        neighborBoxesRef.current = null;
        showCollide(null, f);
        renderGuide([]);
        const group = groupDragRef.current;
        groupDragRef.current = null;
        if (group) {
            // Group-move (B): chốt theo lastGoodDelta (delta đã clamp tường). Chạy
            // applyGroupFollow 1 nhịp cuối để gộp cử động cuối trước khi đọc delta.
            // force=true: engine bỏ snap+collision → giữ layout tương đối + cho chồng đồ
            // (UI đã đảm bảo không vật nào qua tường). 1 transaction = 1 undo, KHÔNG record lẻ.
            applyGroupFollow(node);
            dragFromPosRef.current = null;
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

        // ── Xoay NHÓM (multi-select) — phương án B ───────────────────────────
        // Transformer xoay cả cụm quanh pivot → mỗi node đổi CẢ rotation lẫn position.
        // Commit MỘT lần cho toàn nhóm (các fire sau no-op nhờ groupTransformCommittedRef).
        // CHẶN TƯỜNG: nếu BẤT KỲ vật nào sau khi xoay chạm tường → HỦY cả phép xoay (revert
        // node về snapshot, không dispatch) — nhất quán single-rotate (bị chặn thì giữ góc cũ).
        // Cho chồng đồ (chỉ kiểm tường). force=true: engine giữ layout + bỏ collision đồ.
        if (selectedFurnitureIds.size > 1 && selectedFurnitureIds.has(f.entityId)) {
            if (groupTransformCommittedRef.current) return;
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
                return;
            }

            withTransaction("rotate selection 2D", () => {
                for (const p of poses) {
                    furnitureNodeRefs.current.get(p.id)?.rotation(threeRotYToKonvaDeg(p.rotY));
                    dispatch({ type: "ROTATE_FURNITURE", entityId: p.id, rotY: p.rotY, force: true });
                    dispatch({ type: "MOVE_FURNITURE", entityId: p.id, x: transform.toWorldX(p.px), z: transform.toWorldZ(p.py), force: true });
                }
            });
            return;
        }

        // ── Xoay ĐƠN (đường cũ) ──────────────────────────────────────────────
        const fromRotY = konvaDegToThreeRotY(f.rotDeg);
        const rotY = snapAngleRad(konvaDegToThreeRotY(node.rotation()));
        node.rotation(threeRotYToKonvaDeg(rotY));
        dispatch({ type: "ROTATE_FURNITURE", entityId: f.entityId, rotY });
        recordRotateUndo(f.entityId, fromRotY, rotY);
    }

    return { onDragStart, onDragMove, onDragEnd, onTransformEnd, guideRef, collideRef };
}
