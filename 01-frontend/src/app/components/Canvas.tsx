import { useEffect, useRef } from "react";
import { createEngine } from "@/engine/engine";

/**
 * Canvas 3D — khởi động engine một lần duy nhất khi mount.
 *
 * Engine tự quản lý default walls (3 tường mặc định).
 * Mọi thay đổi từ Gizmo trong 3D sẽ được SnapshotSystem
 * emit ra, useWallStore nhận và cập nhật Konva tự động.
 *
 * Không còn cần import usePlanStore hay lắng nghe entityMoved.
 */
export default function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = createEngine(canvasRef.current);

        return () => {
            engine.dispose();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: "100vw", height: "100vh", display: "block" }}
        />
    );
}
