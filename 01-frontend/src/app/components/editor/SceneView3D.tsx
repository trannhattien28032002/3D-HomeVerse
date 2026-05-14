import Canvas from "src/app/components/editor/Canvas";
import type { EngineInstance } from "src/engine/engineTypes";

type SceneView3DProps = {
    onReady?: () => void;
    /** Forwarded to Canvas — called once the engine instance is ready. */
    onEngineCreated?: (engine: EngineInstance) => void;
};

export default function SceneView3D({ onReady, onEngineCreated }: SceneView3DProps = {}) {
    return <Canvas onReady={onReady} onEngineCreated={onEngineCreated} />;
}
