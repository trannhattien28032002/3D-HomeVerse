/**
 * useWallItemDrag — nhánh KÉO CỬA/KỆ (wall-item) tách khỏi useFurnitureDrag (Phase 5.5).
 *
 * Sở hữu state của riêng gesture wall-item:
 *   - pendingWallMoveRef: lệnh MOVE_WALL_ITEM dự kiến (null = đang chồng → không commit).
 *   - dragFromWallRef: topology TRƯỚC khi kéo (cho command-inverse undo, R3).
 *
 * Chính sách: REJECT khi chồng (không set pending) — KHÁC 3D `slideWallItem` (SNAP).
 * Xem PHASE5-REFACTOR-PLAN §2/5.2: 3 đường wall-item-move có policy overlap khác chủ đích.
 *
 * Imperative `showCollide` (ô đỏ) dùng CHUNG với floor-drag nên do composer truyền vào.
 */
import { useRef } from "react";
import type Konva from "konva";

import { occupancyLane } from "src/shared/geometry/wallMount";
import { buildOccupiedRanges, occupiedOverlaps } from "src/engine/utils/wallOccupancy";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import { projectToNearestWall, buildOpeningOccupancy } from "src/app/features/plan2d/wallItemDrag2D";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Furniture2D, Wall2D, Node2D } from "src/app/features/plan2d/types";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

type Deps = {
    furniture: Furniture2D[];
    walls: Wall2D[];
    nodeById: Map<string, Node2D>;
    transform: PlanTransform;
    dispatch: (cmd: EngineCommand) => void;
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
    /** Hiện/ẩn ô đỏ báo chồng lấn — imperative, dùng chung với floor-drag (composer sở hữu). */
    showCollide: (at: { cx: number; cy: number; rotDeg: number } | null, f: Furniture2D) => void;
};

export type WallItemDrag = {
    /** onDragStart: ghi topology gốc cho undo. */
    start: (f: Furniture2D) => void;
    /** onDragMove + bước đầu của onDragEnd: chiếu node lên tường gần nhất, bám tường, tô đỏ khi chồng. */
    project: (node: Konva.Group, f: Furniture2D) => void;
    /** onDragEnd: commit MOVE_WALL_ITEM nếu hợp lệ, ngược lại trả node về chỗ cũ. */
    end: (node: Konva.Group, f: Furniture2D) => void;
};

export function useWallItemDrag(deps: Deps): WallItemDrag {
    const { furniture, walls, nodeById, transform, dispatch, recordWallItemMoveUndo, showCollide } = deps;

    /** Lệnh move-wall-item dự kiến (null = đang chồng lấn → không commit). */
    const pendingWallMoveRef = useRef<{ entityId: string; hostWallId: string; t: number; side: number } | null>(null);
    /** Wall-move trước khi kéo cửa (cho command-inverse undo, R3). */
    const dragFromWallRef = useRef<{ hostWallId: string; t: number; side: number } | null>(null);

    /**
     * Kéo cửa: chiếu node lên tường gần nhất (free-drag → bám tường), GIỮ side hiện tại,
     * tô đỏ khi chồng opening khác hoặc khi cửa rời khỏi mọi tường.
     * Đặt node + rotation imperative để không re-render.
     */
    function project(node: Konva.Group, f: Furniture2D): void {
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

    function start(f: Furniture2D): void {
        if (f.hostWallId !== undefined && f.wallT !== undefined && f.wallSide !== undefined) {
            dragFromWallRef.current = { hostWallId: f.hostWallId, t: f.wallT, side: f.wallSide };
        } else {
            dragFromWallRef.current = null;
        }
    }

    function end(node: Konva.Group, f: Furniture2D): void {
        project(node, f);
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
    }

    return { start, project, end };
}
