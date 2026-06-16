/**
 * Trang editor chính — tích hợp toàn bộ UI và engine.
 *
 * Sau R7 (M5): component chỉ còn orchestration. Logic phức tạp đã tách ra:
 *   useEngineSelectionSync — 3 engine event → useUIStore.selected
 *   useSceneFileIO         — Ctrl+S save / Ctrl+O load file .homeverseplan
 *   usePlacementRouting    — routing DecorCatalog.onSelect theo mode + constraint
 *
 * Trạng thái toàn cục:
 *   mode       — "2d" (PlanView2D) hoặc "3d" (SceneView3D), toggle bằng Tab
 *   isPlacing  — đang đặt đồ vật (placeholder mode)
 *   gizmoMode  — "translate" hoặc "rotate", phản ánh trạng thái Gizmo từ engine
 *
 * Loading flow:
 *   1. Random progress bar tăng đến 80% trong 220ms interval.
 *   2. Khi SceneView3D.onReady() fires → progress = 100 → engineReady = true.
 *   3. LoadingScreen fade-out → setShowLoader(false) để unmount khỏi DOM.
 */
import { useEffect, useRef, useState } from "react";
import { EngineContext } from "src/app/engine/EngineContext";
import type { EngineInstance } from "src/engine/engineTypes";
import LoadingScreen from "src/app/components/editor/overlays/LoadingScreen";
import TopNavBar from "src/app/components/editor/navigation/TopNavBar";
import BottomNavBar from "src/app/components/editor/navigation/BottomNavBar";
import BuildPanel from "src/app/components/editor/panels/BuildPanel";
import SceneView3D from "src/app/components/editor/views/SceneView3D";
import PlanView2D from "src/app/components/editor/views/PlanView2D";
import DecorCatalog from "src/app/components/editor/panels/DecorCatalog";
import MaterialSidebar from "src/app/components/editor/panels/MaterialSidebar";
import PlacementHint from "src/app/components/editor/overlays/PlacementHint";
import WallPlacementHint from "src/app/components/editor/overlays/WallPlacementHint";
import AIChatbot from "src/app/components/editor/overlays/AIChatbot";
import SaveLoadModal from "src/app/components/editor/overlays/SaveLoadModal";
import { useUIStore } from "src/app/store/useUIStore";
import { useEditorShortcuts } from "src/app/hooks/useEditorShortcuts";
import type { Mode } from "src/app/constants/navigation";

import { useEngineSelectionSync } from "./useEngineSelectionSync";
import { useSceneFileIO } from "./useSceneFileIO";
import { usePlacementRouting } from "./usePlacementRouting";

export default function EditorPage() {
    const [mode, setMode] = useState<Mode>("3d");
    const [isPlacing, setIsPlacing] = useState(false);
    // Có 2 state chính của Gizmo: Translate và Rotate (Không có Scale)
    const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
    const syncViewport = useUIStore((state) => state.syncViewport);
    const isDecorCatalogOpen = useUIStore((state) => state.isDecorCatalogOpen);
    const closeDecorCatalog = useUIStore((state) => state.closeDecorCatalog);
    const toggleDecorCatalog = useUIStore((state) => state.toggleDecorCatalog);
    const selected = useUIStore((state) => state.selected);
    const isMaterialSidebarOpen = useUIStore((state) => state.isMaterialSidebarOpen);
    const openMaterialSidebar = useUIStore((state) => state.openMaterialSidebar);
    const closeMaterialSidebar = useUIStore((state) => state.closeMaterialSidebar);
    const isChatbotOpen = useUIStore((state) => state.isChatbotOpen);
    const closeChatbot = useUIStore((state) => state.closeChatbot);
    const isSaveLoadOpen = useUIStore((state) => state.isSaveLoadOpen);
    const closeSaveLoad = useUIStore((state) => state.closeSaveLoad);
    const wallPlacementModelId = useUIStore((state) => state.wallPlacementModelId);
    const activeTool2D = useUIStore((state) => state.activeTool2D);
    const setTool2D = useUIStore((state) => state.setTool2D);
    const activeNav = (activeTool2D === "placing" || activeTool2D === "placing-wall") ? "decor" : activeTool2D === "draw" ? "build" : "select";
    const [engine, setEngine] = useState<EngineInstance | null>(null);
    const engineRef = useRef<EngineInstance | null>(null);
    useEffect(() => { engineRef.current = engine; }, [engine]);

    const [progress, setProgress] = useState(0);
    const [engineReady, setEngineReady] = useState(false);
    const [showLoader, setShowLoader] = useState(true);
    const [showMaterialHint, setShowMaterialHint] = useState(false);
    const materialHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        return engine.api.events.on("gizmoModeChanged", ({ mode }) => setGizmoMode(mode));
    }, [engine]);

    // ── Selection 3D → store (R7: delegated to useEngineSelectionSync) ───────
    useEngineSelectionSync(engine);

    // ── Placement events ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!engine) return;
        const off1 = engine.api.events.on("placementStarted",   () => setIsPlacing(true));
        const off2 = engine.api.events.on("placementConfirmed", () => setIsPlacing(false));
        const off3 = engine.api.events.on("placementCancelled", () => setIsPlacing(false));
        return () => { off1(); off2(); off3(); };
    }, [engine]);

    // ── Save / Load (R7: delegated to useSceneFileIO) ────────────────────────
    const { handleSave, handleLoad, fileInputRef, onFileChange } = useSceneFileIO(engineRef);

    // ── Placement routing (R7: delegated to usePlacementRouting) ─────────────
    const onDecorSelect = usePlacementRouting(engine, mode);

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
        selectedObjectId: selected?.kind === "object" ? selected.id : null,
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
                    onColorClick={() => {
                        if (!selected) {
                            if (materialHintTimer.current) clearTimeout(materialHintTimer.current);
                            setShowMaterialHint(true);
                            materialHintTimer.current = setTimeout(() => setShowMaterialHint(false), 2500);
                            return;
                        }
                        if (isMaterialSidebarOpen) closeMaterialSidebar();
                        else openMaterialSidebar();
                    }}
                    gizmoMode={gizmoMode}
                    onGizmoModeChange={(m) => engine?.api.setGizmoMode(m)}
                />

                <MaterialSidebar
                    key={selected ? `${selected.kind}:${selected.id}` : "none"}
                    open={isMaterialSidebarOpen}
                    selected={selected}
                    engine={engine}
                    onClose={closeMaterialSidebar}
                />

                <DecorCatalog
                    isOpen={isDecorCatalogOpen}
                    onClose={closeDecorCatalog}
                    onSelect={onDecorSelect}
                />

                {showMaterialHint && (
                    <div
                        style={{
                            position: "fixed",
                            bottom: 100,
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 50,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 20px",
                            borderRadius: 9999,
                            background: "rgba(241,238,229,0.95)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            border: "1px solid rgba(248,180,0,0.45)",
                            boxShadow: "0 4px 20px rgba(124,88,0,0.18)",
                            fontFamily: "'Nunito Sans', sans-serif",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#504532",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            userSelect: "none",
                            animation: "fadeInUp 0.2s ease",
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f8b400", lineHeight: 1 }}>
                            touch_app
                        </span>
                        Chọn một object, tường, hoặc sàn để đổi material
                    </div>
                )}
                {isPlacing && <PlacementHint />}
                {wallPlacementModelId && <WallPlacementHint />}
                <AIChatbot isOpen={isChatbotOpen} onClose={closeChatbot} />
                <SaveLoadModal
                    isOpen={isSaveLoadOpen}
                    onClose={closeSaveLoad}
                    onSave={handleSave}
                    onLoad={handleLoad}
                />
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
                    onChange={onFileChange}
                />
            </div>
        </EngineContext.Provider>
    );
}
