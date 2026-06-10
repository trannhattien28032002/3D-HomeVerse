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
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";

import { konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { snapAngleRad } from "src/shared/constants/placement";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { obbCorners, collidesWithWalls, collidesWithFurniture } from "src/app/components/editor/tools/collision2D";
import { buildFurnitureBoxes2D } from "./wallSegments2D";
import { projectToNearestWall, buildOpeningOccupancy } from "./wallItemDrag2D";
import { buildOccupiedRanges, occupiedOverlaps } from "src/engine/utils/wallOccupancy";
import { occupancyLane } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import type { PlanTransform } from "src/app/plan2d/PlanTransform";
import type { Furniture2D, Wall2D, Node2D } from "src/app/plan2d/types";
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
    setSelectedWallIds: Dispatch<SetStateAction<Set<string>>>;
    dispatch: (cmd: EngineCommand) => void;
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
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
    setSelectedWallIds,
    dispatch, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
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
        const r = resolveAlignment({
            cx: transform.toWorldX(pos.x),
            cz: transform.toWorldZ(pos.y),
            hw: f.width / (2 * transform.scale),
            hd: f.depth / (2 * transform.scale),
            rotY: konvaDegToThreeRotY(f.rotDeg),
            walls: wallSegments,
            neighbors: neighborBoxesRef.current ?? buildFurnitureBoxes2D(furniture, transform, f.entityId),
        });
        const intendedX = transform.toPxX(r.x);
        const intendedY = transform.toPxY(r.z);

        const poly = obbCorners(intendedX, intendedY, f.width, f.depth, f.rotDeg);
        const colliding = collidesWithWalls(poly, walls) || collidesWithFurniture(poly, furniture, f.entityId);

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
        }
        dragTransactionOpenRef.current = true;
    }

    function onDragMove(e: KonvaEventObject<MouseEvent>, f: Furniture2D): void {
        if (f.isWallItem) {
            projectWallItem(e.target as Konva.Group, f);
            return;
        }
        applyFurnitureDrag(e.target as Konva.Group, f);
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
        const { x, z } = applyFurnitureDrag(node, f);
        neighborBoxesRef.current = null;
        showCollide(null, f);
        renderGuide([]);
        dispatch({ type: "MOVE_FURNITURE", entityId: f.entityId, x, z });
        const fromPos = dragFromPosRef.current;
        dragFromPosRef.current = null;
        if (fromPos) {
            recordMoveUndo(f.entityId, fromPos.x, fromPos.z, x, z);
        }
    }

    function onTransformEnd(e: KonvaEventObject<Event>, f: Furniture2D): void {
        const node = e.target as Konva.Group;
        node.scaleX(1);
        node.scaleY(1);
        if (f.isWallItem) return;
        const fromRotY = konvaDegToThreeRotY(f.rotDeg);
        const rotY = snapAngleRad(konvaDegToThreeRotY(node.rotation()));
        node.rotation(threeRotYToKonvaDeg(rotY));
        dispatch({ type: "ROTATE_FURNITURE", entityId: f.entityId, rotY });
        recordRotateUndo(f.entityId, fromRotY, rotY);
    }

    return { onDragStart, onDragMove, onDragEnd, onTransformEnd, guideRef, collideRef };
}
