// @vitest-environment jsdom
/**
 * usePlanCamera.test — pan/zoom imperative + debounce commit + ss/sh scale-stable
 * helpers.
 *
 * QUAN TRỌNG (đọc kỹ source trước khi viết test): `panImperative`/`zoomImperative`
 * đều early-return ngay sau `const stage = stageRef.current; if (!stage) return;`
 * — TOÀN BỘ phần sau đó (Stage position/scale + lưới nền + debounce setTimeout
 * commit state) nằm SAU early-return này. Nghĩa là:
 *   - Khi `stageRef.current` còn null (Stage Konva chưa mount) → chỉ ref cập nhật,
 *     KHÔNG có debounce commit nào được lên lịch (state stageScale/stagePos đứng yên).
 *   - Khi có Stage thật → mới thật sự chạy nhánh Stage/lưới + debounce commit.
 * Test dựng 1 fake Konva.Stage tối thiểu (position/scale/batchDraw/container) để
 * bao phủ CẢ HAI nhánh này thay vì giả định nhầm behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type Konva from "konva";

import { usePlanCamera, ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from "src/app/features/plan2d/hooks/usePlanCamera";

/** Fake Konva.Stage tối thiểu — chỉ implement 4 method usePlanCamera thực sự gọi. */
function makeFakeStage(): Konva.Stage {
    const containerEl = document.createElement("div");
    return {
        position: vi.fn(),
        scale: vi.fn(),
        batchDraw: vi.fn(),
        container: () => containerEl,
    } as unknown as Konva.Stage;
}

describe("usePlanCamera", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("giá trị khởi tạo: scale=1, pos={0,0}, gridSizePx=100×scale", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        expect(result.current.stageScale).toBe(1);
        expect(result.current.stagePos).toEqual({ x: 0, y: 0 });
        expect(result.current.gridSizePx).toBe(100);
        expect(result.current.isPanning).toBe(false);
    });

    it("KHI CHƯA có Stage: panImperative/zoomImperative chỉ cập nhật ref, early-return an toàn (không throw, không setState)", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));

        act(() => { result.current.panImperative(10, 20); });
        expect(result.current.stagePosRef.current).toEqual({ x: 10, y: 20 });
        expect(result.current.stagePos).toEqual({ x: 0, y: 0 }); // chưa commit

        act(() => { result.current.zoomImperative(2, { x: 5, y: 5 }); });
        expect(result.current.stageScaleRef.current).toBe(2);
        act(() => { vi.advanceTimersByTime(1000); });
        // Không có Stage → nhánh debounce-commit không hề chạy → state đứng yên vĩnh viễn.
        expect(result.current.stageScale).toBe(1);
    });

    it("commitPan() đồng bộ state stagePos theo giá trị ref hiện tại (không cần Stage)", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));

        act(() => { result.current.panImperative(10, 20); });
        act(() => { result.current.commitPan(); });

        expect(result.current.stagePos).toEqual({ x: 10, y: 20 });
    });

    it("CÓ Stage: panImperative gọi stage.position()+batchDraw() và cập nhật lưới nền (backgroundPosition)", () => {
        const { result } = renderHook(() => usePlanCamera(450, 320));
        const stage = makeFakeStage();
        result.current.stageRef.current = stage;

        act(() => { result.current.panImperative(30, 15); });

        expect(stage.position).toHaveBeenCalledWith({ x: 30, y: 15 });
        expect(stage.batchDraw).toHaveBeenCalled();
        // gridPx=100 (scale mặc định=1); gx=((450*1+30)%100+100)%100=80; gy=((320+15)%100+100)%100=35.
        expect(stage.container().style.backgroundPosition).toBe("80px 35px");
    });

    it("CÓ Stage: zoomImperative cập nhật ref+Stage NGAY, debounce commit state sau ZOOM_COMMIT_DELAY_MS=200ms", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        const stage = makeFakeStage();
        result.current.stageRef.current = stage;

        act(() => { result.current.zoomImperative(2, { x: 5, y: 5 }); });

        expect(result.current.stageScaleRef.current).toBe(2);
        expect(result.current.stagePosRef.current).toEqual({ x: 5, y: 5 });
        expect(stage.scale).toHaveBeenCalledWith({ x: 2, y: 2 });
        expect(stage.position).toHaveBeenCalledWith({ x: 5, y: 5 });
        // State CHƯA commit ngay — chờ debounce.
        expect(result.current.stageScale).toBe(1);

        act(() => { vi.advanceTimersByTime(200); });

        expect(result.current.stageScale).toBe(2);
        expect(result.current.stagePos).toEqual({ x: 5, y: 5 });
    });

    it("CÓ Stage: zoom liên tiếp trước khi debounce hết hạn → chỉ giá trị CUỐI được commit (reset timer)", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        result.current.stageRef.current = makeFakeStage();

        act(() => { result.current.zoomImperative(2, { x: 1, y: 1 }); });
        act(() => { vi.advanceTimersByTime(100); }); // < 200ms — timer đầu chưa chạy
        act(() => { result.current.zoomImperative(3, { x: 2, y: 2 }); }); // reset debounce

        // Đủ 200ms kể từ lần zoom ĐẦU nhưng chỉ 100ms kể từ lần zoom THỨ HAI — timer đầu
        // đã bị clearTimeout, nên state vẫn chưa commit.
        act(() => { vi.advanceTimersByTime(100); });
        expect(result.current.stageScale).toBe(1); // chưa commit

        act(() => { vi.advanceTimersByTime(100); }); // đủ 200ms kể từ lần zoom thứ hai
        expect(result.current.stageScale).toBe(3);   // commit giá trị CUỐI, không phải 2
        expect(result.current.stagePos).toEqual({ x: 2, y: 2 });
    });

    it("ss() clamp mẫu số ở ANNOTATION_SCALE_MIN=0.35 (chống chữ/nét quá to khi zoom-out sâu); sh() KHÔNG clamp", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        result.current.stageRef.current = makeFakeStage();

        act(() => { result.current.zoomImperative(0.1, { x: 0, y: 0 }); });
        act(() => { vi.advanceTimersByTime(200); }); // commit stageScale=0.1 để ss/sh dùng state mới
        expect(result.current.stageScale).toBe(0.1);

        // ss: mẫu số clamp về max(0.35, 0.1) = 0.35 → 35/0.35 = 100.
        expect(result.current.ss(35)).toBeCloseTo(100);
        // sh: KHÔNG clamp → 35/0.1 = 350.
        expect(result.current.sh(35)).toBeCloseTo(350);
    });

    it("ss()/sh() ở scale bình thường (>ANNOTATION_SCALE_MIN) cho kết quả giống hệt nhau", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        result.current.stageRef.current = makeFakeStage();

        act(() => { result.current.zoomImperative(2, { x: 0, y: 0 }); });
        act(() => { vi.advanceTimersByTime(200); });
        expect(result.current.stageScale).toBe(2);

        expect(result.current.ss(100)).toBeCloseTo(50);
        expect(result.current.sh(100)).toBeCloseTo(50);
    });

    it("gridOffsetX/Y tính đúng theo origin + stagePos + gridSizePx (modulo dương, không cần Stage)", () => {
        const { result } = renderHook(() => usePlanCamera(450, 320));

        expect(result.current.gridSizePx).toBe(100);
        expect(result.current.gridOffsetX).toBeCloseTo(50); // 450 % 100
        expect(result.current.gridOffsetY).toBeCloseTo(20); // 320 % 100

        act(() => { result.current.panImperative(30, 15); });
        act(() => { result.current.commitPan(); }); // commit để state stagePos đổi → gridOffset (derived từ state) đổi theo

        expect(result.current.gridOffsetX).toBeCloseTo(80); // (450+30) % 100
        expect(result.current.gridOffsetY).toBeCloseTo(35); // (320+15) % 100
    });

    it("setIsPanning cập nhật state isPanning", () => {
        const { result } = renderHook(() => usePlanCamera(0, 0));
        act(() => { result.current.setIsPanning(true); });
        expect(result.current.isPanning).toBe(true);
    });

    it("hằng số zoom xuất ra đúng biên (dùng bởi handler wheel ở component cha)", () => {
        expect(ZOOM_MIN).toBe(0.1);
        expect(ZOOM_MAX).toBe(8);
        expect(ZOOM_FACTOR).toBeCloseTo(1.12);
    });
});
