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
 * Loading flow (2 pha — loader CHỜ scene tải xong hẳn rồi mới tắt):
 *   Pha A (engine boot): progress crawl 0→40% cho tới khi SceneView3D.onReady()
 *     fire → engineReady = true. Đây mới chỉ là Three.js khởi tạo xong.
 *   Pha B (tải scene): engineReady kích useScenePersistence GET scene + deserialize
 *     (tải GLB tuần tự) → loadProgress 0→1 → map vào 45→100%.
 *   Tắt: khi engineReady && scene settled (status ready/error, hoặc không có
 *     project) → loaderDone → LoadingScreen fade-out → setShowLoader(false).
 *   Lý do: trước đây loader tắt ngay ở engineReady nên GLB/scene tải sau lưng,
 *     đồ vật "pop in" khi user đã vào. Giờ loader phủ trọn quá trình tải.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { EngineContext } from "src/app/engineBinding/EngineContext";
import type { EngineInstance } from "src/engine/engineTypes";
import LoadingScreen from "src/app/components/editor/overlays/LoadingScreen";
import TopNavBar from "src/app/components/editor/navigation/TopNavBar";
import BottomNavBar from "src/app/components/editor/navigation/BottomNavBar";
import BuildPanel from "src/app/components/editor/panels/BuildPanel";
import SceneView3D from "src/app/components/editor/views/SceneView3D";
import PlanView2D from "src/app/features/plan2d/PlanView2D";
import DecorCatalog from "src/app/components/editor/panels/DecorCatalog";
import MaterialSidebar from "src/app/components/editor/panels/MaterialSidebar";
import PlacementHint from "src/app/components/editor/overlays/PlacementHint";
import WallPlacementHint from "src/app/components/editor/overlays/WallPlacementHint";
import AIChatbot from "src/app/components/editor/overlays/AIChatbot";
import SaveLoadModal from "src/app/components/editor/overlays/SaveLoadModal";
import VersionsPanel from "src/app/components/editor/overlays/VersionsPanel";
import EntityCounter from "src/app/components/editor/overlays/EntityCounter";
import { useUIStore } from "src/app/store/useUIStore";
import { useSelectionStore } from "src/app/store/useSelectionStore";
import { toast } from "src/app/store/useToastStore";
import { useEditorShortcuts } from "src/app/hooks/useEditorShortcuts";
import { useEngineEvent } from "src/app/hooks/useEngineEvent";
import type { Mode } from "src/app/constants/navigation";

import { useEngineSelectionSync } from "./useEngineSelectionSync";
import { useSceneFileIO } from "./useSceneFileIO";
import { usePlacementRouting } from "./usePlacementRouting";
import { useScenePersistence } from "./useScenePersistence";
import { useCatalogBootstrap } from "./useCatalogBootstrap";
import { useEditorLoadingProgress } from "./useEditorLoadingProgress";
import SaveStatusPill from "src/app/components/editor/overlays/SaveStatusPill";
import MaterialHintToast from "src/app/components/editor/overlays/MaterialHintToast";
import EditorTour from "src/app/components/editor/overlays/EditorTour";
import ShortcutsModal from "src/app/components/editor/overlays/ShortcutsModal";

// ── Loader tuning ─────────────────────────────────────────────────────────
/** Thời gian hiển thị gợi ý "chọn vật để đổi màu" khi chưa chọn gì (ms). */
const MATERIAL_HINT_MS = 2500;

export default function EditorPage() {
    const { id: projectId } = useParams();
    const [mode, setMode] = useState<Mode>("3d");
    const [isPlacing, setIsPlacing] = useState(false);
    // Có 2 state chính của Gizmo: Translate và Rotate (Không có Scale)
    const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
    const syncViewport = useUIStore((state) => state.syncViewport);
    const isDecorCatalogOpen = useUIStore((state) => state.isDecorCatalogOpen);
    const closeDecorCatalog = useUIStore((state) => state.closeDecorCatalog);
    const toggleDecorCatalog = useUIStore((state) => state.toggleDecorCatalog);
    const selected = useSelectionStore((state) => state.selected);
    const selectedFurnitureIds = useSelectionStore((state) => state.selectedFurnitureIds);
    const isMaterialSidebarOpen = useUIStore((state) => state.isMaterialSidebarOpen);
    const openMaterialSidebar = useUIStore((state) => state.openMaterialSidebar);
    const closeMaterialSidebar = useUIStore((state) => state.closeMaterialSidebar);
    const isChatbotOpen = useUIStore((state) => state.isChatbotOpen);
    const closeChatbot = useUIStore((state) => state.closeChatbot);
    const isSaveLoadOpen = useUIStore((state) => state.isSaveLoadOpen);
    const closeSaveLoad = useUIStore((state) => state.closeSaveLoad);
    const isVersionsOpen = useUIStore((state) => state.isVersionsOpen);
    const closeVersions = useUIStore((state) => state.closeVersions);
    const wallPlacementModelId = useUIStore((state) => state.wallPlacementModelId);
    const activeTool2D = useUIStore((state) => state.activeTool2D);
    const setTool2D = useUIStore((state) => state.setTool2D);
    const activeNav = (activeTool2D === "placing" || activeTool2D === "placing-wall") ? "decor" : activeTool2D === "draw" ? "build" : "select";
    const [engine, setEngine] = useState<EngineInstance | null>(null);
    const engineRef = useRef<EngineInstance | null>(null);
    useEffect(() => { engineRef.current = engine; }, [engine]);

    const [engineReady, setEngineReady] = useState(false);
    const [showMaterialHint, setShowMaterialHint] = useState(false);
    const materialHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── VR (kính): theo dõi trạng thái present → ẩn chrome DOM khi đang trong kính ──
    const isVRPresenting = useUIStore((state) => state.isVRPresenting);
    const setVRPresenting = useUIStore((state) => state.setVRPresenting);
    useEffect(() => {
        if (!engine) return;
        const unsub = engine.xr.subscribe(setVRPresenting);
        return () => { unsub(); setVRPresenting(false); };
    }, [engine, setVRPresenting]);

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
    useEngineEvent(engine, "gizmoModeChanged", ({ mode }) => setGizmoMode(mode));

    // ── P3 perf: ở Plan 2D, chuyển game loop sang "pump theo revision" ────────
    // Tắt full pipeline 3D (physics/orbit/render) mỗi frame khi không xem 3D.
    // SnapshotSystem vẫn emit sau mỗi mutation nên 2D cập nhật bình thường.
    useEffect(() => {
        if (!engine) return;
        engine.api.setActive2D(mode === "2d");
    }, [engine, mode]);

    // ── Selection 3D → store (R7: delegated to useEngineSelectionSync) ───────
    useEngineSelectionSync(engine);

    // ── Placement events ─────────────────────────────────────────────────────
    useEngineEvent(engine, "placementStarted",   () => setIsPlacing(true));
    useEngineEvent(engine, "placementConfirmed", () => setIsPlacing(false));
    useEngineEvent(engine, "placementCancelled", () => setIsPlacing(false));

    // ── Trần số lượng đồ (chống spam): engine từ chối đặt → toast cảnh báo ──────
    useEngineEvent(engine, "entityLimitReached", ({ limit }) => {
        toast.error(`Đã đạt giới hạn ${limit} đồ nội thất trong scene. Hãy xoá bớt trước khi thêm.`);
    });

    // ── Export/Import file .homeverseplan (R7: delegated to useSceneFileIO) ───
    const { handleSave, handleLoad, fileInputRef, onFileChange } = useSceneFileIO(engineRef);

    // ── Catalog bootstrap: nạp objects/materials từ backend trước khi tải scene ──
    const { catalogReady, error: catalogError } = useCatalogBootstrap();
    useEffect(() => {
        if (catalogError) {
            toast.error("Không tải được thư viện nội thất/vật liệu. Hãy kiểm tra kết nối rồi tải lại trang.");
        }
    }, [catalogError]);

    // ── Scene persistence backend (P1): load khi engine + catalog ready + Ctrl+S lưu + autosave ─
    // Gate trên catalogReady: deserialize scene spawn furniture gọi FurnitureCatalog đồng bộ,
    // nên catalog NÊN hydrate xong trước (nếu không getAssetPath ném "Unknown modelId").
    // Nhưng nếu catalog LỖI (catalogError) thì vẫn cho scene load tiếp để loader không kẹt mãi
    // (scene rỗng vẫn mở được; scene có đồ sẽ báo error gracefully thay vì treo).
    const catalogSettled = catalogReady || catalogError !== null;
    const { status: sceneStatus, loadProgress, saveState, saveNow, applyScene } = useScenePersistence(projectId, engineRef, engineReady && catalogSettled);

    // ── Loading: thanh tiến độ 2 pha + vòng đời LoadingScreen (R7/5.6: hook riêng) ──
    const { progress, loaderDone, showLoader, setShowLoader } = useEditorLoadingProgress({
        projectId, engineReady, loadProgress, sceneStatus,
    });

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
        onSave: () => { void saveNow(); },
        onExport: handleSave,
        onLoad: handleLoad,
        selectedObjectId: selected?.kind === "object" ? selected.id : null,
        selectedFurnitureIds,
    });

    return (
        <EngineContext.Provider value={engine}>
            <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", fontFamily: "'Nunito Sans', sans-serif" }}>
                <div style={{ display: isVRPresenting ? "none" : "contents" }}>
                    <TopNavBar mode={mode} />
                    <SaveStatusPill state={saveState} onSave={() => { void saveNow(); }} />
                    <EntityCounter />
                </div>

                <div id="editor-viewport" style={{ position: "absolute", top: isVRPresenting ? 0 : 56, left: 0, right: 0, bottom: 0 }}>
                    <div style={{ display: mode === "3d" ? "block" : "none", width: "100%", height: "100%" }}>
                        <SceneView3D
                            onEngineCreated={setEngine}
                            onReady={() => setEngineReady(true)}
                        />
                    </div>
                    <div style={{ display: mode === "2d" ? "block" : "none", width: "100%", height: "100%" }}>
                        <PlanView2D />
                    </div>
                </div>

                <div style={{ display: isVRPresenting ? "none" : "contents" }}>
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
                            materialHintTimer.current = setTimeout(() => setShowMaterialHint(false), MATERIAL_HINT_MS);
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

                {showMaterialHint && <MaterialHintToast />}
                {isPlacing && <PlacementHint />}
                {wallPlacementModelId && <WallPlacementHint />}
                <AIChatbot isOpen={isChatbotOpen} onClose={closeChatbot} />
                <SaveLoadModal
                    isOpen={isSaveLoadOpen}
                    onClose={closeSaveLoad}
                    onSave={handleSave}
                    onLoad={handleLoad}
                />
                <VersionsPanel
                    open={isVersionsOpen}
                    onClose={closeVersions}
                    projectId={projectId}
                    saveNow={saveNow}
                    applyScene={applyScene}
                />
                {showLoader && (
                    <LoadingScreen
                        progress={progress}
                        done={loaderDone}
                        onFadeOutEnd={() => setShowLoader(false)}
                    />
                )}
                <EditorTour projectId={projectId} ready={!showLoader} mode={mode} setMode={setMode} />
                <ShortcutsModal />
                </div>
                {/* Hidden file input — triggered by Ctrl+O */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".homeverseplan,.json"
                    style={{ display: "none" }}
                    onChange={onFileChange}
                />

                {/* Nút thoát VR nổi — chrome bị ẩn khi present nên cần lối thoát riêng cho
                    màn desktop/emulator. Trong kính Quest thật dùng nút Meta trên controller. */}
                {isVRPresenting && (
                    <button
                        onClick={() => { void engine?.xr.exit(); }}
                        style={{
                            // Trên cả EditorTour (Joyride portal ra body, zIndex 10000) — nút
                            // thoát VR là lối thoát tối hậu nên phải luôn nằm trên cùng.
                            position: "absolute", top: 16, right: 16, zIndex: 10001,
                            display: "flex", alignItems: "center", gap: 6,
                            height: 40, padding: "0 16px",
                            background: "rgba(20,20,28,0.82)", color: "#fff",
                            border: "1px solid rgba(255,255,255,0.25)", borderRadius: 9999,
                            fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, fontWeight: 700,
                            cursor: "pointer", backdropFilter: "blur(8px)",
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                        Thoát VR
                    </button>
                )}
            </div>
        </EngineContext.Provider>
    );
}
