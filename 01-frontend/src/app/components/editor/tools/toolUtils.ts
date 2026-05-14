/**
 * Shared constants and pure utility functions used by all tool classes.
 * No React, no Konva, no ECS — only geometry and snap math.
 */

import type { Node2D, Wall2D } from "src/app/store/useFloorPlanStore";

// ── Shared constants ──────────────────────────────────────────────────────────

/** 1 world unit = 100 px */
export const PX_PER_WORLD = 100;

/** Grid snap increment in px (100mm) */
export const SNAP_SIZE = 10;

/** Node/wall snap radius in screen pixels (scale-compensated at runtime) */
export const SNAP_RADIUS = 16;

/** Wall thickness in px (150mm default at 100px/m) */
export const WALL_THICKNESS = 0.15 * PX_PER_WORLD;

/** Minimum wall length in px before a wall is committed */
export const MIN_WALL_PX = 5;

/** Hide interactive handles below this stage scale */
export const HANDLE_HIDE_BELOW = 0.20;

/** Angles (degrees) that angle-snap constrains to */
export const ANGLE_SNAP_ANGLES = [15, 30, 45, 60, 90, 120, 135, 150, 180] as const;

/** How close (degrees) the cursor must be to a snap angle to trigger */
export const ANGLE_SNAP_THRESHOLD_DEG = 4;

// ── Coordinate helpers ────────────────────────────────────────────────────────

export function toWorldX(px: number, originX: number): number {
    return (px - originX) / PX_PER_WORLD;
}

export function toWorldZ(py: number, originY: number): number {
    return (py - originY) / PX_PER_WORLD;
}

// ── Snap helpers ──────────────────────────────────────────────────────────────

export type Px = { x: number; y: number };

/**
 * Snaps a raw canvas position to the nearest node, wall midpoint, or grid.
 * Returns the snapped position and what was snapped to (for downstream logic).
 */
export function snapToNodeOrGrid(
    raw: Px,
    nodes: Node2D[],
    walls: Wall2D[],
    originX: number,
    originY: number,
    excludeNodeId?: number,
    scale = 1,
): { pos: Px; snappedNodeId: number | null; snappedWallId: number | null } {
    const snapRadius = SNAP_RADIUS / scale;

    // ── Node snap ─────────────────────────────────────────────────────────────
    let bestNode: Node2D | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
        if (n.id === excludeNodeId) continue;
        const d = Math.hypot(raw.x - n.x, raw.y - n.y);
        if (d < snapRadius && d < bestDist) { bestDist = d; bestNode = n; }
    }
    if (bestNode) return { pos: { x: bestNode.x, y: bestNode.y }, snappedNodeId: bestNode.id, snappedWallId: null };

    // ── Wall snap ─────────────────────────────────────────────────────────────
    let bestWallId: number | null = null;
    let bestWallPos: Px | null = null;
    let bestWallDist = Infinity;

    for (const w of walls) {
        const start = nodes.find(n => n.id === w.startNodeId);
        const end   = nodes.find(n => n.id === w.endNodeId);
        if (!start || !end) continue;
        if (start.id === excludeNodeId || end.id === excludeNodeId) continue;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;

        let t = ((raw.x - start.x) * dx + (raw.y - start.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = start.x + t * dx;
        const projY = start.y + t * dy;
        const dist  = Math.hypot(raw.x - projX, raw.y - projY);

        if (dist < snapRadius && dist < bestWallDist) {
            bestWallDist = dist;
            bestWallPos  = { x: projX, y: projY };
            bestWallId   = w.id;
        }
    }

    if (bestWallPos && bestWallId !== null) {
        return { pos: bestWallPos, snappedNodeId: null, snappedWallId: bestWallId };
    }

    // ── Grid snap ─────────────────────────────────────────────────────────────
    const gridSnap = (px: number, origin: number) =>
        Math.round((px - origin) / SNAP_SIZE) * SNAP_SIZE + origin;

    return {
        pos: { x: gridSnap(raw.x, originX), y: gridSnap(raw.y, originY) },
        snappedNodeId: null,
        snappedWallId: null,
    };
}

/**
 * Constrains `pos` to an angle that is a multiple of ANGLE_SNAP_ANGLES
 * relative to walls already connected at `anchorNodeId`.
 */
export function applyAngleSnap(
    pos: Px,
    anchorNodeId: number,
    nodes: Node2D[],
    walls: Wall2D[],
): Px {
    const anchor = nodes.find(n => n.id === anchorNodeId);
    if (!anchor) return pos;

    const dx = pos.x - anchor.x;
    const dy = pos.y - anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return pos;

    const newAngle = Math.atan2(dy, dx);
    const refWalls = walls.filter(w => w.startNodeId === anchorNodeId || w.endNodeId === anchorNodeId);
    if (refWalls.length === 0) return pos;

    let bestDiff = ANGLE_SNAP_THRESHOLD_DEG;
    let bestPos: Px | null = null;

    for (const w of refWalls) {
        const otherId = w.startNodeId === anchorNodeId ? w.endNodeId : w.startNodeId;
        const other   = nodes.find(n => n.id === otherId);
        if (!other) continue;

        const refAngle = Math.atan2(other.y - anchor.y, other.x - anchor.x);

        for (const snapDeg of ANGLE_SNAP_ANGLES) {
            for (const sign of [1, -1] as const) {
                const target = refAngle + sign * snapDeg * (Math.PI / 180);
                let diff = Math.abs(newAngle - target) * (180 / Math.PI);
                diff = ((diff % 360) + 360) % 360;
                if (diff > 180) diff = 360 - diff;
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestPos  = {
                        x: anchor.x + Math.cos(target) * dist,
                        y: anchor.y + Math.sin(target) * dist,
                    };
                }
            }
        }
    }

    return bestPos ?? pos;
}
