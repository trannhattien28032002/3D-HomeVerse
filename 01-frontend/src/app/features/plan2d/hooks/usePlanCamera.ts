/**
 * usePlanCamera — pan / zoom state cho PlanView2D Stage.
 *
 * Tách ra từ PlanView2D (Đợt 6) để index.tsx chỉ còn composition.
 * Trả về stateScaleRef / stagePosRef để các handler đọc giá trị tức thì
 * mà không bị stale closure (ref không trigger re-render).
 *
 * Pan/zoom imperative (P1 — perf):
 *   Pan và zoom KHÔNG đổi dữ liệu scene nên không được đi qua React setState mỗi
 *   frame (xem 2D-PERF-FIX-PLAN.md). Thay vào đó:
 *     - panImperative / zoomImperative: cập nhật thẳng Konva Stage (position/scale)
 *       + nền lưới (CSS background của container) + batchDraw — KHÔNG setState.
 *     - commitPan: setState 1 lần khi thả chuột → viewport culling re-sync.
 *     - zoom: debounce commit (~120ms sau wheel cuối) → ss/LOD/cull re-sync.
 *   stageScaleRef/stagePosRef luôn là nguồn sự thật tức thì; state chỉ là "ảnh
 *   chụp" để React-derived values (ss, LOD, culling) bám theo.
 */
import { useCallback, useRef, useState } from "react";
import type Konva from "konva";

const GRID_SIZE            = 100;
const ANNOTATION_SCALE_MIN = 0.35;
/** Trễ commit zoom về React state (đồng bộ ss/LOD/cull sau khi ngừng cuộn).
 *  Phải > khoảng cách giữa 2 nấc lăn chuột "nhanh" (~100–150ms) để commit nặng
 *  (re-render + re-cull + recache mốc zoom) KHÔNG chen vào giữa mỗi nấc → hết giật.
 *  Đánh đổi: sau khi ngừng lăn, ~200ms mới "snap" lại độ dày stroke/độ nét — chấp nhận. */
const ZOOM_COMMIT_DELAY_MS = 200;

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
    /** Ref gắn vào <Stage> để pan/zoom cập nhật imperative. */
    stageRef: React.MutableRefObject<Konva.Stage | null>;
    isPanning: boolean;
    setIsPanning: (v: boolean) => void;
    panStartRef: React.MutableRefObject<PanStart | null>;
    /** Pan imperative — cập nhật vị trí Stage + lưới, KHÔNG setState. */
    panImperative: (x: number, y: number) => void;
    /** Commit vị trí pan về React state (gọi khi thả chuột) → re-cull. */
    commitPan: () => void;
    /** Zoom imperative — cập nhật scale+pos Stage + lưới; debounce commit state. */
    zoomImperative: (newScale: number, newPos: { x: number; y: number }) => void;
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
    const stageRef = useRef<Konva.Stage | null>(null);
    const zoomCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Đồng bộ nền lưới (CSS background của container Stage) với scale+pos hiện tại.
    // index.tsx set background lần đầu qua style prop; khi pan/zoom imperative ta
    // dời backgroundPosition/Size trực tiếp để lưới chạy theo mà không re-render.
    const applyGridStyle = useCallback((stage: Konva.Stage, scale: number, pos: { x: number; y: number }) => {
        const gridPx = GRID_SIZE * scale;
        const gx = (((originX * scale + pos.x) % gridPx) + gridPx) % gridPx;
        const gy = (((originY * scale + pos.y) % gridPx) + gridPx) % gridPx;
        const c = stage.container();
        c.style.backgroundSize     = `${gridPx}px ${gridPx}px`;
        c.style.backgroundPosition = `${gx}px ${gy}px`;
    }, [originX, originY]);

    // PAN imperative — scale KHÔNG đổi nên ss/LOD/labels vẫn đúng; chỉ dời vị trí.
    const panImperative = useCallback((x: number, y: number) => {
        stagePosRef.current = { x, y };
        const stage = stageRef.current;
        if (!stage) return;
        stage.position({ x, y });
        applyGridStyle(stage, stageScaleRef.current, stagePosRef.current);
        stage.batchDraw();
    }, [applyGridStyle]);

    // Thả chuột: commit 1 lần để useVisibleFurniture re-cull theo vùng nhìn mới.
    const commitPan = useCallback(() => {
        setStagePos({ ...stagePosRef.current });
    }, []);

    // ZOOM imperative — đổi scale nên ss/LOD/cull cần đồng bộ, nhưng chỉ ở frame
    // cuối: cập nhật Stage ngay, debounce setState ~120ms sau lần wheel cuối.
    const zoomImperative = useCallback((newScale: number, newPos: { x: number; y: number }) => {
        stageScaleRef.current = newScale;
        stagePosRef.current   = newPos;
        const stage = stageRef.current;
        if (!stage) return;
        stage.scale({ x: newScale, y: newScale });
        stage.position(newPos);
        applyGridStyle(stage, newScale, newPos);
        stage.batchDraw();
        if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current);
        zoomCommitTimer.current = setTimeout(() => {
            setStageScale(stageScaleRef.current);
            setStagePos({ ...stagePosRef.current });
        }, ZOOM_COMMIT_DELAY_MS);
    }, [applyGridStyle]);

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
        stageScale, stagePos, stageScaleRef, stagePosRef, stageRef,
        isPanning, setIsPanning, panStartRef,
        panImperative, commitPan, zoomImperative,
        gridSizePx, gridOffsetX, gridOffsetY,
        ss, sh,
    };
}
