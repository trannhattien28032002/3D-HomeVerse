import { useEffect, useRef } from "react";
import { createEngine } from "@/engine/engine";
import { usePlanStore } from "@/app/store/usePlanStore";
// import { setEngineBridge } from "@/app/engine/engineBridge";
// import { useEditorStore } from "@/app/store/useEditorStore";
import { Transform } from "@/engine/components/Transform";
import { WallSize } from "@/engine/components/WallSize";

export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        // const { setSelectedEntityId, setDragging, setInspectorTransform } =
        //     useEditorStore.getState();

        // 🚀 START ENGINE
        // Mapping between Plan2D(px) and 3D(world):
        // - Origin is the center of viewport.
        // - Keep Konva Y and world Z in the same direction to avoid "flipped" feeling.
        const PX_PER_WORLD = 20;
        const ORIGIN_X = window.innerWidth / 2;
        const ORIGIN_Y = window.innerHeight / 2;

        const initialWalls = usePlanStore.getState().walls;
        const wallDefs = initialWalls.map((wall) => ({
            wallId: wall.id,
            x: (wall.x + wall.w / 2 - ORIGIN_X) / PX_PER_WORLD,
            y: 0.5,
            z: (wall.y + wall.h / 2 - ORIGIN_Y) / PX_PER_WORLD,
            w: Math.max(0.5, wall.w / PX_PER_WORLD),
            h: 1,
            d: Math.max(0.5, wall.h / PX_PER_WORLD),
            rotY: -(wall.rotation * Math.PI) / 180
        }));

        const engine = createEngine(canvasRef.current, {
            walls: wallDefs
        });

        let raf = 0;
        let lastSyncMs = 0;
        const SYNC_INTERVAL_MS = 50;
        const EPS = 0.001;

        let isSyncingFrom3D = false;

        const unsubscribe = usePlanStore.subscribe((state, prevState) => {
            if (isSyncingFrom3D) return;

            // Cập nhật ngầm từ Zustand sang Engine
            const originXNow = window.innerWidth / 2;
            const originYNow = window.innerHeight / 2;

            const prevIds = new Set(prevState.walls.map(w => w.id));

            for (const wall of state.walls) {
                const wd = {
                    wallId: wall.id,
                    x: (wall.x + wall.w / 2 - originXNow) / PX_PER_WORLD,
                    y: 0.5,
                    z: (wall.y + wall.h / 2 - originYNow) / PX_PER_WORLD,
                    w: Math.max(0.01, wall.w / PX_PER_WORLD),
                    h: 1,
                    d: Math.max(0.01, wall.h / PX_PER_WORLD),
                    rotY: -(wall.rotation * Math.PI) / 180
                };

                if (!prevIds.has(wall.id)) {
                    engine.api.addWall(wd);
                } else {
                    const prevW = prevState.walls.find(pw => pw.id === wall.id);
                    if (prevW && (
                        Math.abs(prevW.x - wall.x) > EPS ||
                        Math.abs(prevW.y - wall.y) > EPS ||
                        Math.abs(prevW.w - wall.w) > EPS ||
                        Math.abs(prevW.h - wall.h) > EPS ||
                        Math.abs(prevW.rotation - wall.rotation) > EPS
                    )) {
                        engine.api.updateWall(wd);
                    }
                }
            }
        });

        const sync3DTo2D = () => {
            raf = requestAnimationFrame(sync3DTo2D);

            const now = performance.now();
            if (now - lastSyncMs < SYNC_INTERVAL_MS) return;
            lastSyncMs = now;

            const originXNow = window.innerWidth / 2;
            const originYNow = window.innerHeight / 2;
            const currentWalls = usePlanStore.getState().walls;

            let changed = false;
            const next = currentWalls.map((wall) => {
                const entity = engine.wallEntityByWallId?.get(wall.id);
                if (entity == null) return wall;

                const t = engine.world.getComponent(entity, Transform);
                const s = engine.world.getComponent(entity, WallSize);
                if (!t || !s) return wall;

                const wPx = s.length * PX_PER_WORLD;
                const hPx = s.thickness * PX_PER_WORLD;

                const x = t.x * PX_PER_WORLD + originXNow - wPx / 2;
                const y = originYNow + t.z * PX_PER_WORLD - hPx / 2;
                const rotation = -(t.rotY * 180) / Math.PI;

                if (
                    Math.abs(wall.x - x) > EPS ||
                    Math.abs(wall.y - y) > EPS ||
                    Math.abs(wall.w - wPx) > EPS ||
                    Math.abs(wall.h - hPx) > EPS ||
                    Math.abs(wall.rotation - rotation) > EPS
                ) {
                    changed = true;
                    return { ...wall, x, y, w: wPx, h: hPx, rotation };
                }

                return wall;
            });

            if (changed) {
                isSyncingFrom3D = true;
                usePlanStore.getState().setWalls(next);
                isSyncingFrom3D = false;
            }
        };

        raf = requestAnimationFrame(sync3DTo2D);

        return () => {
            cancelAnimationFrame(raf);
            unsubscribe();
            engine.dispose?.();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100vw",
                height: "100vh",
                display: "block"
            }}
        />
    );
}