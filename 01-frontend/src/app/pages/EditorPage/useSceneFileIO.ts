/**
 * useSceneFileIO — save/load scene từ file .homeverseplan (R7/M5).
 *
 * Tách ra từ EditorPage để component không chứa FileReader + URL blob logic.
 *
 * Save (Ctrl+S):
 *   serializeScene(engine) → JSON blob → download link → click → revoke.
 *
 * Load (Ctrl+O):
 *   Trigger hidden file input → FileReader → validateSceneDocument → deserializeScene.
 *
 * engineRef giữ instance mới nhất để handler không capture stale closure.
 * Trả về { handleSave, handleLoad, fileInputProps } để EditorPage spread.
 */
import { useRef } from "react";
import type { RefObject } from "react";
import { serializeScene, deserializeScene, validateSceneDocument, validationFailed } from "src/engine/serialization";
import type { SceneDocument } from "src/engine/serialization";
import type { EngineInstance } from "src/engine/engineTypes";

export type SceneFileIOResult = {
    handleSave: () => void;
    handleLoad: () => void;
    fileInputRef: RefObject<HTMLInputElement>;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function useSceneFileIO(engineRef: RefObject<EngineInstance | null>): SceneFileIOResult {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        const eng = engineRef.current;
        if (!eng) return;
        const doc = serializeScene(eng);
        const json = JSON.stringify(doc, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "scene.homeverseplan";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleLoad = () => fileInputRef.current?.click();

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const eng = engineRef.current;
        if (!eng) { alert("Engine not ready. Please wait a moment and try again."); return; }
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const raw = JSON.parse(evt.target?.result as string);
                const result = validateSceneDocument(raw);
                if (validationFailed(result)) {
                    alert(`Cannot load scene: ${result.error}`);
                } else {
                    deserializeScene(raw as SceneDocument, eng);
                }
            } catch {
                alert("Failed to read scene file. Make sure it is a valid .homeverseplan file.");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    return { handleSave, handleLoad, fileInputRef, onFileChange };
}
