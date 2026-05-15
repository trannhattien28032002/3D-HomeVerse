/**
 * useWallStore — shim re-export, đã deprecated.
 *
 * File này chỉ forward export sang useFloorPlanStore để không phá vỡ các import cũ.
 * Không thêm logic mới vào đây.
 *
 * @deprecated Use `useFloorPlanStore` from `@/app/store/useFloorPlanStore` instead.
 *
 * This file is kept as a re-export shim so that any remaining imports don't break.
 * Plan2DPage has been migrated to the new node-driven store.
 */
export { useFloorPlanStore as useWallStore } from "./useFloorPlanStore";
export type { Wall2D } from "./useFloorPlanStore";
