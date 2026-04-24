import { useState, useEffect } from "react";
import type { WallSnapshot } from "@/engine/events/EngineEvents";
import { useUIStore } from "./useUIStore";

// ============================================================
// Public type — 2D pixel-space representation cho Konva
// ============================================================

export type Wall2D = {
    id: number;
    x: number; // center x (px)
    y: number; // center y (px)
    w: number; // width  (px) = WallSize.length * PX_PER_WORLD
    h: number; // height (px) = WallSize.thickness * PX_PER_WORLD
    rotation: number; // degrees
};

const PX_PER_WORLD = 20;

/** Quy đổi WallSnapshot (world-coords) → Wall2D (pixel-coords) */
function worldToPx(wall: WallSnapshot, vpW: number, vpH: number): Wall2D {
    const originX = vpW / 2;
    const originY = vpH / 2;
    return {
        id: wall.wallId,
        x: wall.x * PX_PER_WORLD + originX,
        y: wall.z * PX_PER_WORLD + originY,
        w: wall.w * PX_PER_WORLD,
        h: wall.d * PX_PER_WORLD,
        rotation: -(wall.rotY * 180) / Math.PI,
    };
}

/**
 * Subscribe vào ECS snapshot event và trả về danh sách tường
 * đã được quy đổi sang pixel-coords cho Konva.
 *
 * - Raw snapshots được lưu để re-derive khi viewport thay đổi.
 * - Không có loop, không có polling. Chỉ react khi ECS emit.
 */
export function useWallStore(): Wall2D[] {
    const viewportWidth = useUIStore((s) => s.viewportWidth);
    const viewportHeight = useUIStore((s) => s.viewportHeight);

    // Lưu raw snapshot để re-derive khi viewport thay đổi
    const [rawWalls, setRawWalls] = useState<WallSnapshot[]>(() => {
        return window.gameEngine?.api.events.lastSnapshot?.walls ?? [];
    });

    useEffect(() => {
        const engine = window.gameEngine;
        if (!engine) return;

        // Bắt luôn state hiện tại kể từ lúc hook subscribe để tránh missed emision
        if (engine.api.events.lastSnapshot) {
            setRawWalls(engine.api.events.lastSnapshot.walls);
        }

        // Subscribe — trả về unsubscribe function
        return engine.api.events.on("snapshot", (snap) => {
            setRawWalls(snap.walls);
        });
    }, []);

    // Re-derive mỗi khi rawWalls hoặc viewport thay đổi
    return rawWalls.map((w) => worldToPx(w, viewportWidth, viewportHeight));
}
