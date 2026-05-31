/**
 * usePlanInput — Stage event handlers cho PlanView2D.
 *
 * Tách ra từ PlanView2D (Đợt 6). Xử lý zoom (wheel), pan (middle-mouse),
 * và delegate mouse events xuống tool hiện tại.
 *
 * Nhận camera từ usePlanCamera để đọc/ghi pan-zoom state qua refs
 * (tránh stale closure — ref không trigger re-render).
 */
import type { KonvaEventObject } from "konva/lib/Node";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR, type PlanCamera } from "./usePlanCamera";

type Params = {
    camera: PlanCamera;
    isSelectMode: boolean;
    setSelectedFurnitureId: (id: number | null) => void;
    getActiveTool: () => ToolBase;
};

export type PlanInputHandlers = {
    onWheel: (e: KonvaEventObject<WheelEvent>) => void;
    onMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
    onMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
    onMouseUp: (e: KonvaEventObject<MouseEvent>) => void;
    onClick: (e: KonvaEventObject<MouseEvent>) => void;
    onContextMenu: (e: KonvaEventObject<MouseEvent>) => void;
};

export function usePlanInput({ camera, isSelectMode, setSelectedFurnitureId, getActiveTool }: Params): PlanInputHandlers {
    const { stageScaleRef, stagePosRef, setIsPanning, panStartRef, applyTransform, movePan } = camera;

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
        applyTransform(newScale, {
            x: pointer.x - pt.x * newScale,
            y: pointer.y - pt.y * newScale,
        });
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
        if (isSelectMode && e.target === e.target.getStage()) {
            setSelectedFurnitureId(null);
        }
        getActiveTool().onStageMouseDown(e);
    }

    function onMouseMove(e: KonvaEventObject<MouseEvent>) {
        // panStartRef.current set ↔ isPanning — check ref để tránh stale closure
        if (panStartRef.current) {
            movePan({
                x: panStartRef.current.stageX + e.evt.clientX - panStartRef.current.mouseX,
                y: panStartRef.current.stageY + e.evt.clientY - panStartRef.current.mouseY,
            });
            return;
        }
        getActiveTool().onStageMouseMove(e);
    }

    function onMouseUp(e: KonvaEventObject<MouseEvent>) {
        if (e.evt.button === 1) {
            setIsPanning(false);
            panStartRef.current = null;
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
