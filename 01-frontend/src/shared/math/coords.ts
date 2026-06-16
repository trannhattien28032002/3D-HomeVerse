export const PX_PER_WORLD = 100;

// ── Thế giới ↔ Canvas ────────────────────────────────────────────────────────────

export function worldToCanvas(worldVal: number, offset: number): number {
    return worldVal * PX_PER_WORLD + offset;
}

export function canvasToWorld(canvasVal: number, offset: number): number {
    return (canvasVal - offset) / PX_PER_WORLD;
}

// ── Phép xoay ──────────────────────────────────────────────────────────────────

/** Three.js rotY (radian, ngược chiều kim đồng hồ) → góc xoay Konva (độ, theo chiều kim đồng hồ). */
export function threeRotYToKonvaDeg(rotY: number): number {
    return -(rotY * 180 / Math.PI);
}

/** Góc xoay Konva (độ, theo chiều kim đồng hồ) → Three.js rotY (radian, ngược chiều kim đồng hồ). */
export function konvaDegToThreeRotY(deg: number): number {
    return -(deg * Math.PI / 180);
}
