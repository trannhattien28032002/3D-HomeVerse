/**
 * usePlanInput — Stage event handlers cho PlanView2D.
 *
 * Tách ra từ PlanView2D (Đợt 6). Xử lý zoom (wheel), pan (middle-mouse),
 * marquee box-select (left-drag trên nền trống ở tool select), và delegate
 * mouse events còn lại xuống tool hiện tại.
 *
 * Nhận camera từ usePlanCamera để đọc/ghi pan-zoom state qua refs
 * (tránh stale closure — ref không trigger re-render).
 */
import { useRef } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { Furniture2D, Wall2D, Node2D } from "src/app/features/plan2d/types";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR, type PlanCamera } from "src/app/features/plan2d/hooks/usePlanCamera";

/** Ngưỡng (px màn hình) phân biệt marquee-drag với click bỏ chọn. */
const MARQUEE_MIN_PX = 4;

type Params = {
    camera: PlanCamera;
    isSelectMode: boolean;
    /** Bỏ chọn phòng khi click nền trống (giữ 3 loại selection đồng bộ). */
    setSelectedRoomKey: (key: string | null) => void;
    getActiveTool: () => ToolBase;
    // ── Marquee box-select (Phase 5) ──────────────────────────────────────────
    furniture: Furniture2D[];
    walls: Wall2D[];
    nodeById: Map<string, Node2D>;
    setSelectedFurnitureIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setSelectedWallIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    /** Rect rubber-band — host render trong overlay, hook điều khiển imperative. */
    marqueeRef: MutableRefObject<Konva.Rect | null>;
};

export type PlanInputHandlers = {
    onWheel: (e: KonvaEventObject<WheelEvent>) => void;
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
    onMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
    onMouseUp: (e: KonvaEventObject<MouseEvent>) => void;
    onClick: (e: KonvaEventObject<MouseEvent>) => void;
    onContextMenu: (e: KonvaEventObject<MouseEvent>) => void;
};

export function usePlanInput({
    camera, isSelectMode, setSelectedRoomKey, getActiveTool,
    furniture, walls, nodeById, setSelectedFurnitureIds, setSelectedWallIds, marqueeRef,
}: Params): PlanInputHandlers {
    const { stageScaleRef, stagePosRef, setIsPanning, panStartRef, panImperative, commitPan, zoomImperative } = camera;

    // Marquee gesture state (imperative — không re-render trong lúc kéo).
    const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
    const marqueeShiftRef = useRef(false);

    function onWheel(e: KonvaEventObject<WheelEvent>) {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        if (!stage) return;
        const pointer  = stage.getPointerPosition()!;
        const oldScale = stageScaleRef.current;
        const oldPos   = stagePosRef.current;
        const factor   = e.evt.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldScale * factor));
        const pt = {
            x: (pointer.x - oldPos.x) / oldScale,
            y: (pointer.y - oldPos.y) / oldScale,
        };
        // Imperative + debounce commit — không setState mỗi tick wheel (P1b).
        zoomImperative(newScale, {
            x: pointer.x - pt.x * newScale,
            y: pointer.y - pt.y * newScale,
        });
    }

    // ── Marquee helpers ───────────────────────────────────────────────────────

    /** Cập nhật Rect rubber-band imperative theo điểm start + con trỏ hiện tại. */
    function drawMarquee(cur: { x: number; y: number }): void {
        const start = marqueeStartRef.current;
        const r = marqueeRef.current;
        if (!start || !r) return;
        const x = Math.min(start.x, cur.x);
        const y = Math.min(start.y, cur.y);
        r.position({ x, y });
        r.size({ width: Math.abs(cur.x - start.x), height: Math.abs(cur.y - start.y) });
        r.visible(true);
        r.getLayer()?.batchDraw();
    }

    /** Tường (AABB 2 node) giao khung marquee. */
    function wallInRect(w: Wall2D, minX: number, maxX: number, minY: number, maxY: number): boolean {
        const a = nodeById.get(w.startNodeId);
        const b = nodeById.get(w.endNodeId);
        if (!a || !b) return false;
        const wMinX = Math.min(a.x, b.x), wMaxX = Math.max(a.x, b.x);
        const wMinY = Math.min(a.y, b.y), wMaxY = Math.max(a.y, b.y);
        return wMinX <= maxX && wMaxX >= minX && wMinY <= maxY && wMaxY >= minY;
    }

    /** Kết thúc marquee: chọn furniture (tâm trong khung) hoặc tường (AABB giao), mutual-exclusion. */
    function endMarquee(cur: { x: number; y: number }): void {
        const start = marqueeStartRef.current!;
        const shift = marqueeShiftRef.current;
        marqueeStartRef.current = null;
        const r = marqueeRef.current;
        if (r) { r.visible(false); r.getLayer()?.batchDraw(); }

        const movedPx = Math.max(Math.abs(cur.x - start.x), Math.abs(cur.y - start.y)) * stageScaleRef.current;
        if (movedPx < MARQUEE_MIN_PX) {
            // Click nền trống (không kéo) → bỏ chọn tất cả (giữ hành vi cũ). Shift = giữ nguyên.
            if (!shift) {
                setSelectedFurnitureIds(new Set());
                setSelectedWallIds(new Set());
                setSelectedRoomKey(null);
            }
            return;
        }

        const minX = Math.min(start.x, cur.x), maxX = Math.max(start.x, cur.x);
        const minY = Math.min(start.y, cur.y), maxY = Math.max(start.y, cur.y);

        // Ưu tiên furniture (tương tác phổ biến nhất); chỉ rơi sang tường khi khung
        // không trùm vật nào. Store tự cross-clear loại còn lại khi set non-empty.
        const furnHits = furniture
            .filter(f => f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY)
            .map(f => f.entityId);
        if (furnHits.length > 0) {
            setSelectedFurnitureIds(prev => shift ? new Set([...prev, ...furnHits]) : new Set(furnHits));
            return;
        }
        const wallHits = walls.filter(w => wallInRect(w, minX, maxX, minY, maxY)).map(w => w.id);
        if (wallHits.length > 0) {
            setSelectedWallIds(prev => shift ? new Set([...prev, ...wallHits]) : new Set(wallHits));
            return;
        }
        // Khung trống → bỏ chọn (trừ khi shift cộng dồn).
        if (!shift) {
            setSelectedFurnitureIds(new Set());
            setSelectedWallIds(new Set());
            setSelectedRoomKey(null);
        }
    }

    function onMouseDown(e: KonvaEventObject<MouseEvent>) {
        if (e.evt.button === 1) {
            e.evt.preventDefault();
            setIsPanning(true);
            panStartRef.current = {
                mouseX: e.evt.clientX, mouseY: e.evt.clientY,
                stageX: stagePosRef.current.x, stageY: stagePosRef.current.y,
            };
            return;
        }
        // Marquee: chuột trái kéo trên NỀN TRỐNG ở tool select → bắt đầu rubber-band.
        // Hoãn bỏ chọn tới mouseUp (click không kéo = bỏ chọn như cũ; kéo = chọn vùng).
        if (isSelectMode && e.evt.button === 0 && e.target === e.target.getStage()) {
            const stage = e.target.getStage();
            const p = stage?.getRelativePointerPosition();
            if (p) {
                marqueeStartRef.current = { x: p.x, y: p.y };
                marqueeShiftRef.current = e.evt.shiftKey;
                return;
            }
        }
        getActiveTool().onStageMouseDown(e);
    }

    function onMouseMove(e: KonvaEventObject<MouseEvent>) {
        // panStartRef.current set ↔ isPanning — check ref để tránh stale closure.
        // Pan imperative (P1a): cập nhật thẳng Stage, KHÔNG setState mỗi mousemove.
        if (panStartRef.current) {
            panImperative(
                panStartRef.current.stageX + e.evt.clientX - panStartRef.current.mouseX,
                panStartRef.current.stageY + e.evt.clientY - panStartRef.current.mouseY,
            );
            return;
        }
        if (marqueeStartRef.current) {
            const p = e.target.getStage()?.getRelativePointerPosition();
            if (p) drawMarquee(p);
            return;
        }
        getActiveTool().onStageMouseMove(e);
    }

    function onMouseUp(e: KonvaEventObject<MouseEvent>) {
        if (e.evt.button === 1) {
            setIsPanning(false);
            panStartRef.current = null;
            // Commit 1 lần để viewport culling re-sync theo vùng nhìn mới.
            commitPan();
            return;
        }
        if (marqueeStartRef.current) {
            const p = e.target.getStage()?.getRelativePointerPosition() ?? marqueeStartRef.current;
            endMarquee(p);
        }
    }

    function onClick(e: KonvaEventObject<MouseEvent>) {
        getActiveTool().onStageClick(e);
    }

    function onContextMenu(e: KonvaEventObject<MouseEvent>) {
        getActiveTool().onStageContextMenu(e);
    }

    return { onWheel, onMouseDown, onMouseMove, onMouseUp, onClick, onContextMenu };
}
