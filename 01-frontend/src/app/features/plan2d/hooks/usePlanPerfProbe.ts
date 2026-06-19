/**
 * usePlanPerfProbe — P0 perf probe cho PlanView2D (DEV-only).
 *
 * Đo hai chỉ số chính để xác nhận hiệu quả của P1 (pan/zoom imperative):
 *   1. Số lần PlanView2D re-render mỗi giây — pan/zoom đúng (imperative) thì con
 *      số này phải ~0 trong lúc giữ pan; nếu vẫn cao → còn setState rò rỉ.
 *   2. Số node Konva (Shape) trong Stage — proxy cho chi phí raster mỗi batchDraw.
 *
 * Thân probe nằm sau `import.meta.env.DEV` → Vite loại bỏ khỏi prod bundle.
 * Đo ms/frame chi tiết: dùng DevTools → Performance (probe này chỉ log tần suất).
 *
 * Cách dùng: mở console khi ở Plan 2D, pan/zoom và đọc log `[plan-perf]`.
 */
import { useEffect, useRef } from "react";
import type Konva from "konva";

export function usePlanPerfProbe(stageRef: React.MutableRefObject<Konva.Stage | null>): void {
    // Đếm số render: tăng mỗi lần component render (cache thuần trong render — cùng
    // pattern với useVisibleFurniture). eslint refs cảnh báo nhầm với ca counter này.
    /* eslint-disable react-hooks/refs */
    const renderCount = useRef(0);
    renderCount.current++;
    /* eslint-enable react-hooks/refs */

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const id = setInterval(() => {
            const n = renderCount.current;
            renderCount.current = 0;
            if (n === 0) return; // im lặng khi không có hoạt động
            const shapes = stageRef.current?.find("Shape").length ?? 0;
            console.debug(`[plan-perf] ${n} renders/s · ${shapes} Konva shapes`);
        }, 1000);
        return () => clearInterval(id);
    }, [stageRef]);
}
