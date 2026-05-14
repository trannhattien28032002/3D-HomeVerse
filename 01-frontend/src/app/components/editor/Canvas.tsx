import { useEffect, useRef } from "react";
import { createEngine } from "src/engine/engine";
import type { EngineInstance } from "src/engine/engineTypes";

type CanvasProps = {
    onReady?: () => void;
    /** Called once, synchronously after the engine instance is created. */
    onEngineCreated?: (engine: EngineInstance) => void;
};

export default function Canvas({ onReady, onEngineCreated }: CanvasProps = {}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = createEngine(canvasRef.current);
        onEngineCreated?.(engine);

        // Give Three.js one frame to render before hiding the loading screen
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
