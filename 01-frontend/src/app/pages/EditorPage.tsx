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
import DecorCatalog from "src/app/components/editor/DecorCatalog";
import PlacementHint from "src/app/components/editor/PlacementHint";
import { useUIStore } from "src/app/store/useUIStore";
import { useEditorShortcuts } from "src/app/hooks/useEditorShortcuts";
import type { Mode } from "src/app/constants/navigation";

export default function EditorPage() {
    const [mode, setMode] = useState<Mode>("3d");
    const [isPlacing, setIsPlacing] = useState(false);
    // Có 2 state chính của Gizmo: Translate và Rotate (Không có Scale)
    const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
    const syncViewport = useUIStore((state) => state.syncViewport);
    const isDecorCatalogOpen = useUIStore((state) => state.isDecorCatalogOpen);
    const closeDecorCatalog = useUIStore((state) => state.closeDecorCatalog);
    const toggleDecorCatalog = useUIStore((state) => state.toggleDecorCatalog);
    const beginPlacement2D = useUIStore((state) => state.beginPlacement2D);
    const activeTool2D = useUIStore((state) => state.activeTool2D);
    const setTool2D = useUIStore((state) => state.setTool2D);
    const activeNav = activeTool2D === "placing" ? "decor" : activeTool2D === "draw" ? "build" : "select";
    const [engine, setEngine] = useState<EngineInstance | null>(null);
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
        let timer: ReturnType<typeof setTimeout>;
        const onResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => syncViewport(window.innerWidth, window.innerHeight), 150);
        };
        window.addEventListener("resize", onResize);
        return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
    }, [syncViewport]);

    // ── Gizmo mode sync ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!engine) return;
        const off = engine.api.events.on("gizmoModeChanged", ({ mode }) => setGizmoMode(mode));
        return off;
    }, [engine]);

    // ── Placement events ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!engine) return;
        const off1 = engine.api.events.on("placementStarted", () => setIsPlacing(true));
        const off2 = engine.api.events.on("placementConfirmed", () => setIsPlacing(false));
        const off3 = engine.api.events.on("placementCancelled", () => setIsPlacing(false));
        return () => { off1(); off2(); off3(); };
    }, [engine]);

    // ── Save / Load handlers ────────────────────────────────────────────────
    // engineRef giữ instance mới nhất → handler không capture stale closure.
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

    // ── Phím tắt toàn cục ─────────────────────────────────────────────────────
    useEditorShortcuts({
        engine,
        mode,
        setMode,
        setTool2D,
        isPlacing,
        toggleDecorCatalog,
        onSave: handleSave,
        onLoad: handleLoad,
    });

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
                        <PlanView2D />
                    </div>
                </div>

                {mode === "2d" && <BuildPanel activeNav={activeNav} />}

                <BottomNavBar
                    mode={mode}
                    activeNav={activeNav}
                    setMode={setMode}
                    setToolMode2D={setTool2D}
                    engine={engine?.api ?? null}
                    onDecorClick={toggleDecorCatalog}
                    gizmoMode={gizmoMode}
                    onGizmoModeChange={(m) => engine?.api.setGizmoMode(m)}
                />

                <DecorCatalog
                    isOpen={isDecorCatalogOpen}
                    onClose={closeDecorCatalog}
                    onSelect={(id) => {
                        closeDecorCatalog();
                        if (mode === "3d") engine?.api.beginPlacement(id);
                        else beginPlacement2D(id);
                    }}
                />

                {isPlacing && <PlacementHint />}
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
                        e.target.value = "";
                    }}
                />
            </div>
        </EngineContext.Provider>
    );
}
