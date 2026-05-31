import { useEffect, useRef } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { Mode } from "src/app/constants/navigation";
import type { WallToolId } from "src/app/components/editor/tools/toolRegistry";

type Params = {
    engine: EngineInstance | null;
    mode: Mode;
    setMode: (m: Mode) => void;
    setTool2D: (m: WallToolId) => void;
    isPlacing: boolean;
    toggleDecorCatalog: () => void;
    onSave: () => void;
    onLoad: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function useEditorShortcuts(params: Params): void {
    const paramsRef = useRef(params);
    paramsRef.current = params;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const { engine, mode, setMode, setTool2D, isPlacing, toggleDecorCatalog, onSave, onLoad } = paramsRef.current;

            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (key === "s") { e.preventDefault(); onSave(); }
                else if (key === "o") { e.preventDefault(); onLoad(); }
                return;
            }

            if (isTypingTarget(e.target)) return;

            switch (e.key.toLowerCase()) {
                case "v":
                    setTool2D("select");
                    break;
                case "b":
                    setMode("2d");
                    setTool2D("draw");
                    break;
                case "f":
                    e.preventDefault();
                    toggleDecorCatalog();
                    break;
                case "tab":
                    e.preventDefault();
                    setMode(mode === "3d" ? "2d" : "3d");
                    break;
                case "q":
                    if (mode !== "3d" || isPlacing || !engine) return;
                    e.preventDefault();
                    engine.api.setGizmoMode("translate");
                    break;
                case "w":
                    if (mode !== "3d" || isPlacing || !engine) return;
                    e.preventDefault();
                    engine.api.setGizmoMode("rotate");
                    break;
                case "escape":
                    if (!isPlacing) return;
                    e.stopPropagation();
                    engine?.api.cancelPlacement();
                    break;
                default:
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);
}
