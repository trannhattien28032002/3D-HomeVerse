/**
 * MaterialSidebar — panel phải đổi material cho mục tiêu đang chọn.
 *
 * Shell mỏng: header + scroll container, rồi phân nhánh theo `selected.kind` (nguồn:
 * useSelectionStore, dùng chung 2D & 3D) sang 3 panel con (Phase 5.6):
 *   - object → ObjectMaterialPanel (GLB nhiều slot, "Part Selection").
 *   - wall   → WallMaterialPanel   (sơn riêng 2 mặt tường).
 *   - room   → FloorMaterialPanel  (sàn phòng, 1 surface).
 *
 * Nguồn chân lý material nằm ở engine (Model3D.materialOverrides cho object;
 * SurfaceMaterial/floorMaterials cho bề mặt) — panel chỉ nhớ cục bộ để highlight, tự
 * reset khi đổi mục tiêu nhờ EditorPage remount sidebar qua `key`.
 */
import { useMemo } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { SelectedTarget } from "src/app/store/useSelectionStore";
import { getCatalogItem } from "src/engine/catalog/FurnitureCatalog";
import { usePanelTransition } from "src/app/hooks/usePanelTransition";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import { ObjectMaterialPanel } from "./ObjectMaterialPanel";
import { WallMaterialPanel } from "./WallMaterialPanel";
import { FloorMaterialPanel } from "./FloorMaterialPanel";

type Props = {
    open: boolean;
    selected: SelectedTarget | null;
    engine: EngineInstance | null;
    onClose: () => void;
};

export default function MaterialSidebar({ open, selected, engine, onClose }: Props) {
    // Giữ panel mounted trong lúc chạy animation thoát (open→false vẫn còn `selected`).
    const { mounted, closing, onAnimationEnd } = usePanelTransition(open && !!selected);

    // modelId của object đang chọn — tra từ snapshot mới nhất (chỉ dùng cho kind="object").
    const modelId = useMemo(() => {
        if (!mounted || !engine || selected?.kind !== "object") return null;
        return engine.api.events.lastSnapshot?.furniture.find((x) => x.entityId === selected.id)?.modelId ?? null;
    }, [mounted, engine, selected]);

    if (!mounted || !selected) return null;
    const sel = selected;

    const objectName = sel.kind === "object" && modelId ? getCatalogItem(modelId)?.name ?? modelId : "";
    const headerTitle = sel.kind === "object" ? (objectName || "Object")
        : sel.kind === "wall" ? "Tường" : "Sàn";

    return (
        <aside
            role="dialog"
            aria-label="Material Editor"
            className={closing ? "side-panel-anim-out" : "side-panel-anim"}
            onAnimationEnd={onAnimationEnd}
            style={{
                position: "fixed",
                right: 16,
                top: 72,
                bottom: 96,
                width: 320,
                zIndex: 40,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: 20,
                background: "rgba(253,249,240,0.72)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: `1px solid ${alpha(RGB.primaryContainer, 0.25)}`,
                borderRadius: 20,
                boxShadow: `0 16px 48px ${alpha(RGB.primary, 0.20)}`,
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid rgba(213,196,172,0.5)",
                    paddingBottom: 12,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className="material-symbols-outlined" style={{ color: T.primary, fontSize: 22 }}>
                        palette
                    </span>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Material
                        </div>
                        <div
                            style={{
                                fontFamily: "Cinzel, serif",
                                fontSize: 16,
                                fontWeight: 700,
                                color: T.onSurface,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {headerTitle}
                        </div>
                    </div>
                </div>
                <button
                    aria-label="Close"
                    onClick={onClose}
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 32, height: 32, flexShrink: 0,
                        background: "transparent", border: "none", borderRadius: 9999,
                        cursor: "pointer", color: T.onSurfaceVariant,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(230,226,217,0.6)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
            </header>

            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 16 }}>
                {sel.kind === "object" ? (
                    <ObjectMaterialPanel engine={engine} entityId={sel.id} modelId={modelId} />
                ) : sel.kind === "wall" ? (
                    <WallMaterialPanel engine={engine} wallId={sel.id} />
                ) : (
                    <FloorMaterialPanel engine={engine} roomKey={sel.id} />
                )}
            </div>
        </aside>
    );
}
