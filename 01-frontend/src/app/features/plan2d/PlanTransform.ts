/**
 * PlanTransform — coordinate transform object dùng chung cho toàn bộ tầng 2D.
 *
 * Giải quyết M4 (R5): `PX_PER_WORLD`, `originX`, `originY`, và phép `* 100` rải rác
 * ~52 lần trong tools + layers. Tập trung vào một object duy nhất, build một lần
 * trong PlanView2D và truyền qua ToolContext + props layer.
 *
 * Coordinate system:
 *   World: (x, z) metres, origin ở tâm scene
 *   Canvas: (x, y) pixels, origin ở góc trên trái Konva Stage
 *   toPx(worldVal) = worldVal * scale + offset
 *   toWorld(canvasVal) = (canvasVal - offset) / scale
 *
 * Lý do giữ `originX`/`originY` riêng biệt ngoài scale:
 *   - Hai axis (x và y) có cùng scale nhưng offset khác nhau.
 *   - Nhiều caller cần offset riêng (e.g. `toPxX(v)` vs `toPxY(v)`).
 *
 * Sử dụng:
 *   const tr = buildPlanTransform(viewportWidth, viewportHeight);
 *   const canvasX = tr.toPxX(worldX);  // worldX * 100 + vpW/2
 *   const worldX  = tr.toWorldX(canvasX); // (canvasX - vpW/2) / 100
 */
import { PX_PER_WORLD, worldToCanvas, canvasToWorld } from "src/shared/math/coords";

export type PlanTransform = {
    /** Pixels per world metre — hiện tại cố định 100, sau này có thể là dynamic zoom. */
    readonly scale: number;
    /** Canvas X offset: viewport width / 2 */
    readonly originX: number;
    /** Canvas Y offset: viewport height / 2 (Konva Y = world Z) */
    readonly originY: number;
    /** World metres → canvas X pixels. */
    toPxX(worldX: number): number;
    /** World metres → canvas Y pixels (world Z axis). */
    toPxY(worldZ: number): number;
    /** Canvas X pixels → world metres. */
    toWorldX(canvasX: number): number;
    /** Canvas Y pixels → world metres (world Z axis). */
    toWorldZ(canvasY: number): number;
    /** World metres dimension → canvas pixels (scale only, no offset). */
    toPxDim(worldDim: number): number;
};

/**
 * Build a PlanTransform from viewport dimensions.
 * Call once in PlanView2D (or whenever viewport changes) and pass via ToolContext.
 *
 * @param vpW Viewport width in pixels (used to compute originX = vpW/2)
 * @param vpH Viewport height in pixels (used to compute originY = vpH/2)
 */
export function buildPlanTransform(vpW: number, vpH: number): PlanTransform {
    const ox = vpW / 2;
    const oy = vpH / 2;
    return {
        scale: PX_PER_WORLD,
        originX: ox,
        originY: oy,
        toPxX:    (worldX) => worldToCanvas(worldX, ox),
        toPxY:    (worldZ) => worldToCanvas(worldZ, oy),
        toWorldX: (canvasX) => canvasToWorld(canvasX, ox),
        toWorldZ: (canvasY) => canvasToWorld(canvasY, oy),
        toPxDim:  (worldDim) => worldDim * PX_PER_WORLD,
    };
}
