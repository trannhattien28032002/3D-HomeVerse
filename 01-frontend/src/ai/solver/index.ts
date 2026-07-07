/** solver — public API (WP4). Xem AI-AGENT-BUILD-PLAN §WP4. */
export type {
    Anchor, Rect, Footprint, FootprintGetter, SolverRoom, Obstacle,
    PlacementIntent, Placement, LayoutResult,
} from "src/ai/solver/types";
export { resolveAnchor } from "src/ai/solver/anchors";
export { solvePlacement, solveLayout } from "src/ai/solver/layoutSolver";
export {
    aabbHalfExtents, footprintRect, inflate, overlaps, insideRoom, usableBounds, area,
} from "src/ai/solver/rect";
