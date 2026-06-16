/**
 * usePlanCamera — pan / zoom state cho PlanView2D Stage.
 *
 * Tách ra từ PlanView2D (Đợt 6) để index.tsx chỉ còn composition.
 * Trả về stateScaleRef / stagePosRef để các handler đọc giá trị tức thì
 * mà không bị stale closure (ref không trigger re-render).
 */
import { useCallback, useRef, useState } from "react";

const GRID_SIZE            = 100;
const ANNOTATION_SCALE_MIN = 0.35;

export const ZOOM_MIN    = 0.1;
export const ZOOM_MAX    = 8;
export const ZOOM_FACTOR = 1.12;

type PanStart = {
    mouseX: number;
    mouseY: number;
    stageX: number;
    stageY: number;
};

export type PlanCamera = {
    stageScale: number;
    stagePos: { x: number; y: number };
    stageScaleRef: React.MutableRefObject<number>;
    stagePosRef: React.MutableRefObject<{ x: number; y: number }>;
    isPanning: boolean;
    setIsPanning: (v: boolean) => void;
    panStartRef: React.MutableRefObject<PanStart | null>;
    /** Cập nhật cả scale lẫn position (zoom). */
    applyTransform: (newScale: number, newPos: { x: number; y: number }) => void;
    /** Cập nhật chỉ position — không thay đổi scale (pan). */
    movePan: (newPos: { x: number; y: number }) => void;
    gridSizePx: number;
    gridOffsetX: number;
    gridOffsetY: number;
    /** Scale-stable size (text, stroke). */
    ss: (px: number) => number;
    /** Handle-stable size. */
    sh: (px: number) => number;
};

export function usePlanCamera(originX: number, originY: number): PlanCamera {
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos]     = useState({ x: 0, y: 0 });
    const stageScaleRef = useRef(1);
    const stagePosRef   = useRef({ x: 0, y: 0 });
    const [isPanning, setIsPanning]   = useState(false);
    const panStartRef = useRef<PanStart | null>(null);

    function applyTransform(newScale: number, newPos: { x: number; y: number }) {
        stageScaleRef.current = newScale;
        stagePosRef.current   = newPos;
        setStageScale(newScale);
        setStagePos(newPos);
    }

    function movePan(newPos: { x: number; y: number }) {
        stagePosRef.current = newPos;
        setStagePos(newPos);
    }

    // PERF: ss/sh depend only on stageScale, which is unchanged during pan. Wrapping
    // in useCallback keeps their identity stable across pan re-renders, so the memoized
    // layers that receive them as props (Room/Furniture/Handle/Dimension) bail out
    // instead of re-mapping every object each mousemove frame.
    const ss = useCallback(
        (px: number) => px / Math.max(ANNOTATION_SCALE_MIN, stageScale),
        [stageScale],
    );
    const sh = useCallback((px: number) => px / stageScale, [stageScale]);

    const gridSizePx  = GRID_SIZE * stageScale;
    const gridOffsetX = ((originX * stageScale + stagePos.x) % gridSizePx + gridSizePx) % gridSizePx;
    const gridOffsetY = ((originY * stageScale + stagePos.y) % gridSizePx + gridSizePx) % gridSizePx;

    return {
        stageScale, stagePos, stageScaleRef, stagePosRef,
        isPanning, setIsPanning, panStartRef,
        applyTransform, movePan,
        gridSizePx, gridOffsetX, gridOffsetY,
        ss, sh,
    };
}
