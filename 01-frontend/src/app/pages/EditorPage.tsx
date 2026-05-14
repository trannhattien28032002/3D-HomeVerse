import { useEffect, useRef, useState } from "react";
import { serializeScene, deserializeScene, validateSceneDocument, validationFailed } from "src/engine/serialization";
import type { SceneDocument } from "src/engine/serialization";
import { EngineContext } from "src/app/engine/EngineContext";
import type { EngineInstance } from "src/engine/engineTypes";
import LoadingScreen from "src/app/components/editor/LoadingScreen";
import TopNavBar from "src/app/components/editor/TopNavBar";
import BottomNavBar from "src/app/components/editor/BottomNavBar";
import BuildPanel from "src/app/components/editor/BuildPanel";
import SceneView3D from "src/app/components/editor/SceneView3D";
import PlanView2D from "src/app/components/editor/PlanView2D";
import ShortcutHint from "src/app/components/editor/ShortcutHint";
import { useUIStore } from "src/app/store/useUIStore";
import type { Mode } from "src/app/constants/navigation";

export default function EditorPage() {
    const [mode, setMode] = useState<Mode>("3d");
    const [activeNav, setActiveNav] = useState("select");
    const [toolMode2D, setToolMode2D] = useState<"select" | "draw">("select");
    const syncViewport = useUIStore((state) => state.syncViewport);
    
    // Holds the engine instance once Canvas fires onEngineCreated.
    // null until after the first render (engine is created in a useEffect).
    const [engine, setEngine] = useState<EngineInstance | null>(null);
    // Stable ref so the Ctrl+S/Ctrl+O keydown handler never captures a stale closure.
    const engineRef = useRef<EngineInstance | null>(null);
    useEffect(() => { engineRef.current = engine; }, [engine]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [progress, setProgress] = useState(0);
    const [engineReady, setEngineReady] = useState(false);
    const [showLoader, setShowLoader] = useState(true);

    useEffect(() => {
        const id = setInterval(() => {
            setProgress(p => {
                if (p >= 80) { clearInterval(id); return p; }
                return Math.min(p + Math.random() * 12, 80);
            });
        }, 220);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        syncViewport(window.innerWidth, window.innerHeight);
        const onResize = () => syncViewport(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [syncViewport]);

    useEffect(() => {
        const onNav = (e: CustomEvent<{ id: string }>) => {
            const { id } = e.detail;
            setActiveNav(id);
            if (id === "build") {
                setMode("2d");
                setToolMode2D("draw");
            } else if (id === "select") {
                setToolMode2D("select");
            }
        };
        const onToggleMode = () => setMode(m => m === "3d" ? "2d" : "3d");

        window.addEventListener("tinyhome:nav", onNav);
        window.addEventListener("tinyhome:toggleMode", onToggleMode);
        return () => {
            window.removeEventListener("tinyhome:nav", onNav);
            window.removeEventListener("tinyhome:toggleMode", onToggleMode);
        };
    }, []);

    // ── Save / Load keyboard shortcuts ──────────────────────────────────────
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === "s") {
                e.preventDefault();
                const eng = engineRef.current;
                if (!eng) return;
                const doc = serializeScene(eng);
                const json = JSON.stringify(doc, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href     = url;
                a.download = "scene.homeverseplan";
                a.click();
                URL.revokeObjectURL(url);
            }

            if (e.key === "o") {
                e.preventDefault();
                fileInputRef.current?.click();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []); // engineRef is stable — no dependency needed

    return (
        <EngineContext.Provider value={engine}>
        <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", fontFamily: "'Nunito Sans', sans-serif" }}>
            <TopNavBar mode={mode} />

            <div style={{ position: "absolute", top: 56, left: 0, right: 0, bottom: 0 }}>
                <div style={{ display: mode === "3d" ? "block" : "none", width: "100%", height: "100%" }}>
                    <SceneView3D
                        onEngineCreated={setEngine}
                        onReady={() => {
                            setProgress(100);
                            setTimeout(() => setEngineReady(true), 350);
                        }}
                    />
                </div>
                <div style={{ display: mode === "2d" ? "block" : "none", width: "100%", height: "100%" }}>
                    <PlanView2D
                        toolMode={mode === "2d" ? toolMode2D : undefined}
                        onToolModeChange={m => {
                            setToolMode2D(m);
                            setActiveNav(m === "draw" ? "build" : "select");
                        }}
                    />
                </div>
            </div>

            {mode === "2d" && <BuildPanel activeNav={activeNav} />}

            <BottomNavBar
                mode={mode}
                activeNav={activeNav}
                setActiveNav={setActiveNav}
                setMode={setMode}
                setToolMode2D={setToolMode2D}
            />

            <ShortcutHint />

            {showLoader && (
                <LoadingScreen
                    progress={progress}
                    done={engineReady}
                    onFadeOutEnd={() => setShowLoader(false)}
                />
            )}
            {/* Hidden file input — triggered by Ctrl+O */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".homeverseplan,.json"
                style={{ display: "none" }}
                onChange={(e) => {
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
                    // Reset so the same file can be re-loaded.
                    e.target.value = "";
                }}
            />
        </div>
        </EngineContext.Provider>
    );
}
