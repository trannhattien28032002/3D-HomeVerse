/**
 * WallMaterialPanel — nhánh "wall" của MaterialSidebar: sơn RIÊNG 2 mặt tường.
 *
 * Slot-list (clone Part Selection của object) chọn mặt left/right → MaterialGrid preset
 * tường → SET_WALL_MATERIAL / RESET_WALL_MATERIAL theo face. State (selectedFace +
 * wallFaceMat) khởi tạo từ engine khi mount; reset khi đổi target nhờ remount qua `key`.
 * Tách từ index.tsx (Phase 5.6).
 */
import { useState } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { WallFace } from "src/engine/components/render/SurfaceMaterial";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import { MaterialGrid } from "./MaterialGrid";
import { getWallCategories } from "./materialCatalog";
import { ResetButton } from "./ResetButton";

type Props = {
    engine: EngineInstance | null;
    wallId: string;
};

export function WallMaterialPanel({ engine, wallId }: Props) {
    const [selectedFace, setSelectedFace] = useState<WallFace>("left");
    const [wallFaceMat, setWallFaceMat] = useState<{ left: string | null; right: string | null }>(() =>
        engine
            ? { left: engine.api.getWallMaterial(wallId, "left"), right: engine.api.getWallMaterial(wallId, "right") }
            : { left: null, right: null }
    );

    /** Đổi material cho MẶT tường đang chọn (selectedFace). */
    function handleWallPick(materialId: string) {
        if (!engine) return;
        const face = selectedFace;
        engine.api.transaction("change wall material", () => {
            engine.api.dispatch({ type: "SET_WALL_MATERIAL", wallId, materialId, face });
        });
        setWallFaceMat((p) => ({ ...p, [face]: materialId }));
    }

    /** Khôi phục material mặc định cho MẶT tường đang chọn. */
    function handleWallReset() {
        if (!engine) return;
        const face = selectedFace;
        engine.api.transaction("reset wall material", () => {
            engine.api.dispatch({ type: "RESET_WALL_MATERIAL", wallId, face });
        });
        setWallFaceMat((p) => ({ ...p, [face]: null }));
    }

    return (
        <>
            {/* Chọn mặt */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                    <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Chọn mặt
                    </span>
                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                </div>
                {(["left", "right"] as const).map((face, i) => {
                    const isSel = face === selectedFace;
                    return (
                        <button
                            key={face}
                            onClick={() => setSelectedFace(face)}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 12px",
                                background: isSel ? alpha(RGB.primaryContainer, 0.18) : "transparent",
                                border: isSel ? `1px solid ${alpha(RGB.primaryContainer, 0.5)}` : "1px solid transparent",
                                borderLeft: isSel ? `3px solid ${T.primary}` : "3px solid transparent",
                                borderRadius: 12, cursor: "pointer", textAlign: "left",
                                transition: "background 0.15s, border-color 0.15s",
                            }}
                            onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = alpha(RGB.primaryContainer, 0.08); }}
                            onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 9999, background: isSel ? T.primary : "rgba(213,196,172,0.8)", flexShrink: 0 }} />
                                <span style={{ fontSize: isSel ? 15 : 14, fontWeight: isSel ? 700 : 400, color: isSel ? T.onSurface : T.onSurfaceVariant }}>
                                    {`Mặt ${i + 1}`}
                                </span>
                            </div>
                            {wallFaceMat[face] && (
                                <span style={{ fontSize: 10, color: "#837560", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {wallFaceMat[face]}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Material grid cho mặt đang chọn */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                    <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        Material · {`Mặt ${selectedFace === "left" ? 1 : 2}`}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                    <ResetButton onClick={handleWallReset} />
                </div>
                <MaterialGrid
                    allowedCategories={getWallCategories()}
                    selectedId={wallFaceMat[selectedFace]}
                    onPick={handleWallPick}
                />
            </div>
        </>
    );
}
