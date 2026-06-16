/**
 * useVisibleFurniture — viewport culling cho FurnitureLayer (Phase 2 perf).
 *
 * Chỉ render những object có bbox cắt với khung nhìn hiện tại (world-px rect =
 * nghịch đảo transform của Stage). Với N lớn, chi phí vẽ + hit-graph giờ tỉ lệ
 * với số object TRONG khung nhìn thay vì tổng số.
 *
 * Ổn định reference (then chốt để không phá memo Phase 1):
 *   Trả về CÙNG mảng cũ khi "nội dung hiển thị" không đổi (cùng id-set + vị trí +
 *   kích thước + cờ overlap). Nhờ vậy pan trong cùng một vùng → FurnitureLayer bail
 *   out; chỉ khi pan/zoom làm lộ object mới (id-set đổi) hoặc object dịch chuyển
 *   (dragEnd) thì mới re-render — và khi đó cũng chỉ map đúng tập đang thấy.
 *
 * forceVisibleIds: object đang chọn luôn được render dù ngoài khung nhìn, để
 * Transformer ở HandleLayer còn node Konva mà bám vào (furnitureNodeRefs).
 */
import { useRef } from "react";
import type { Furniture2D } from "src/app/plan2d/types";

/** Đệm world-px quanh viewport để tránh object "nhảy vào" đột ngột ở mép. */
const CULL_MARGIN_PX = 200;

export function useVisibleFurniture(
    furniture: Furniture2D[],
    stagePos: { x: number; y: number },
    stageScale: number,
    viewportWidth: number,
    viewportHeight: number,
    forceVisibleIds: Set<string>,
): Furniture2D[] {
    const prevRef    = useRef<Furniture2D[]>(furniture);
    const prevKeyRef = useRef<string | null>(null);

    // Khung nhìn ở world-px = nghịch đảo transform của Stage, nới thêm CULL_MARGIN_PX.
    const left   = (0 - stagePos.x) / stageScale - CULL_MARGIN_PX;
    const right  = (viewportWidth  - stagePos.x) / stageScale + CULL_MARGIN_PX;
    const top    = (0 - stagePos.y) / stageScale - CULL_MARGIN_PX;
    const bottom = (viewportHeight - stagePos.y) / stageScale + CULL_MARGIN_PX;

    const visible: Furniture2D[] = [];
    for (const f of furniture) {
        // r = bán kính bbox an toàn khi xoay (center-anchored): max(w,d) ≥ nửa đường chéo.
        const r = Math.max(f.width, f.depth);
        const inView =
            f.x + r >= left && f.x - r <= right &&
            f.y + r >= top  && f.y - r <= bottom;
        if (inView || forceVisibleIds.has(f.entityId)) visible.push(f);
    }

    // Khóa nội dung hiển thị — nếu trùng khung trước thì trả mảng cũ (referential stable).
    let key = "";
    for (const f of visible) {
        key += `${f.entityId}:${f.x}:${f.y}:${f.rotDeg}:${f.width}:${f.depth}:${f.overlapping ? 1 : 0}|`;
    }
    // Cache referential-stability: CỐ Ý đọc/ghi ref trong render. Đây là cache thuần —
    // key suy ra hoàn toàn từ input nên không bao giờ "miss update" (nội dung đổi ⇒ key
    // đổi ⇒ trả mảng mới), đúng như cách useMemo làm nội bộ. Cùng pattern với
    // stableWallsRef trong index.tsx. react-hooks/refs cảnh báo nhầm với ca này.
    /* eslint-disable react-hooks/refs */
    if (key === prevKeyRef.current) return prevRef.current;
    prevKeyRef.current = key;
    prevRef.current = visible;
    return visible;
    /* eslint-enable react-hooks/refs */
}
