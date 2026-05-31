/**
 * SceneView3D — wrapper mỏng cho Canvas trong chế độ 3D.
 * Forward props xuống Canvas để EditorPage không phụ thuộc trực tiếp vào Canvas.
 * Nếu sau này cần thêm HUD overlay hoặc 3D-specific UI, thêm vào đây.
 */
import Canvas from "src/app/components/editor/Canvas";
import type { EngineInstance } from "src/engine/engineTypes";

type SceneView3DProps = {
    onReady?: () => void;
    /** Forward xuống Canvas — EditorPage dùng để nhận engine vào EngineContext. */
    onEngineCreated?: (engine: EngineInstance) => void;
};

export default function SceneView3D({ onReady, onEngineCreated }: SceneView3DProps = {}) {
    return <Canvas onReady={onReady} onEngineCreated={onEngineCreated} />;
}
