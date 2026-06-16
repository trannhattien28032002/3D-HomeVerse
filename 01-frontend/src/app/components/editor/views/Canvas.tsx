/**
 * Canvas — component wrapper cho Three.js WebGL canvas.
 *
 * Trách nhiệm:
 *   1. Render <canvas> element và giữ ref
 *   2. Gọi createEngine(canvas) trong useEffect (sau render đầu tiên)
 *   3. Fire onEngineCreated() → EditorPage nhận engine, đưa vào EngineContext
 *   4. Fire onReady() sau 1 frame (Three.js cần 1 frame để render lần đầu)
 *   5. Cleanup: engine.dispose() khi unmount
 *
 * Lý do dùng useEffect (không khởi tạo ngay trong render):
 *   createEngine() cần DOM element thật — chỉ có sau khi React commit.
 *   deps=[] đảm bảo engine chỉ tạo một lần duy nhất.
 */
import { useEffect, useRef } from "react";
import { createEngine } from "src/engine/engine";
import type { EngineInstance } from "src/engine/engineTypes";

type CanvasProps = {
    onReady?: () => void;
    /** Gọi đồng bộ ngay sau khi engine instance được tạo — EditorPage dùng để set EngineContext. */
    onEngineCreated?: (engine: EngineInstance) => void;
};

export default function Canvas({ onReady, onEngineCreated }: CanvasProps = {}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = createEngine(canvasRef.current);
        onEngineCreated?.(engine);

        // Chờ 1 frame để Three.js render xong trước khi ẩn loading screen
        const raf = requestAnimationFrame(() => {
            onReady?.();
        });

        return () => {
            cancelAnimationFrame(raf);
            engine.dispose();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <canvas
            ref={canvasRef}
            style={{ width: "100vw", height: "100vh", display: "block" }}
        />
    );
}
