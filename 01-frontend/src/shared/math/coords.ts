/**
 * Coordinate + rotation conversion utilities.
 *
 * World  : (x, z) in metres, origin at scene centre.
 * Canvas : (x, y) in pixels (Konva), origin at top-left of Stage.
 *          canvasX = worldX * PX_PER_WORLD + offsetX
 *          canvasY = worldZ * PX_PER_WORLD + offsetY  (no axis flip)
 *
 * Rotation:
 *   Three.js rotY+  = counter-clockwise when viewed from above (radians).
 *   Konva rotation+ = clockwise degrees.
 *   → threeToKonva negate-and-convert; konvaToThree is the exact inverse.
 *
 * Keep this file free of React / Three.js / Konva imports — pure math only.
 *
 * Layer: shared/math — usable by BOTH engine/ and app/.
 * Moved from src/engine/utils/coords.ts in Đợt 1 (REFACTOR-PLAN.md).
 */

export const PX_PER_WORLD = 100;

// ── World ↔ Canvas ────────────────────────────────────────────────────────────

export function worldToCanvas(worldVal: number, offset: number): number {
    return worldVal * PX_PER_WORLD + offset;
}

export function canvasToWorld(canvasVal: number, offset: number): number {
    return (canvasVal - offset) / PX_PER_WORLD;
}

// ── Rotation ──────────────────────────────────────────────────────────────────

/** Three.js rotY (CCW radians) → Konva rotation (CW degrees). */
export function threeRotYToKonvaDeg(rotY: number): number {
    return -(rotY * 180 / Math.PI);
}

/** Konva rotation (CW degrees) → Three.js rotY (CCW radians). */
export function konvaDegToThreeRotY(deg: number): number {
    return -(deg * Math.PI / 180);
}
