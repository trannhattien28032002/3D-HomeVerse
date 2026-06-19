/**
 * MaterialSidebar — panel phải đổi material cho mục tiêu đang chọn.
 *
 * Phân nhánh theo `selected.kind` (nguồn: useUIStore, dùng chung 2D & 3D):
 *   - object: GLB nhiều slot → "Part Selection" (materialSlots) → MaterialGrid lọc
 *             theo allowedCategories → APPLY_FURNITURE_MATERIAL (đổi sub-mesh).
 *   - wall:   bề mặt tường (1 surface) → MaterialGrid preset tường → SET_WALL_MATERIAL.
 *   - room:   sàn phòng (1 surface)   → MaterialGrid preset sàn   → SET_FLOOR_MATERIAL.
 *
 * Material đã chọn được nhớ cục bộ để highlight; nguồn chân lý thực tế nằm ở engine
 * (Model3D.materialOverrides cho object; SurfaceMaterial/floorMaterials cho bề mặt).
 * State tự reset khi đổi mục tiêu nhờ EditorPage remount qua `key`.
 */
import { useMemo, useState } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { SelectedTarget } from "src/app/store/useSelectionStore";
import type { WallFace } from "src/engine/components/render/SurfaceMaterial";
import { getCatalogItem, getMaterialSlots } from "src/engine/catalog/FurnitureCatalog";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import { MaterialGrid } from "./MaterialGrid";
import { WALL_CATEGORIES, FLOOR_CATEGORIES } from "./materialCatalog";

type Props = {
    open: boolean;
    selected: SelectedTarget | null;
    engine: EngineInstance | null;
    onClose: () => void;
};

/** Nút nhỏ "Mặc định" — khôi phục material gốc cho slot/bề mặt đang chọn. */
function ResetButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title="Khôi phục material mặc định"
            className="material-reset-btn"
            style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px",
                borderRadius: 9999,
                cursor: "pointer",
                color: T.onSurfaceVariant,
                fontSize: 11,
                lineHeight: 1,
            }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            Mặc định
        </button>
    );
}

export default function MaterialSidebar({ open, selected, engine, onClose }: Props) {
    // modelId của object đang chọn — tra từ snapshot mới nhất (chỉ dùng cho kind="object").
    const modelId = useMemo(() => {
        if (!open || !engine || selected?.kind !== "object") return null;
        return engine.api.events.lastSnapshot?.furniture.find((x) => x.entityId === selected.id)?.modelId ?? null;
    }, [open, engine, selected]);

    const slots = useMemo(() => (modelId ? getMaterialSlots(modelId) : []), [modelId]);

    // State object (per-slot) — khởi tạo từ engine khi mount, reset khi đổi target (key).
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string>>(() =>
        (engine && selected?.kind === "object") ? engine.api.getEntityMaterials(selected.id) : {}
    );
    // State sàn (room) — 1 surface.
    const [floorMaterialId, setFloorMaterialId] = useState<string | null>(() =>
        (engine && selected?.kind === "room") ? engine.api.getFloorMaterial(selected.id) : null
    );
    // State tường (wall) — material RIÊNG 2 mặt + mặt đang chọn (slot-list).
    const [selectedFace, setSelectedFace] = useState<WallFace>("left");
    const [wallFaceMat, setWallFaceMat] = useState<{ left: string | null; right: string | null }>(() =>
        (engine && selected?.kind === "wall")
            ? { left: engine.api.getWallMaterial(selected.id, "left"), right: engine.api.getWallMaterial(selected.id, "right") }
            : { left: null, right: null }
    );

    if (!open || !selected) return null;
    // Const không-null để giữ narrowing trong các closure (handler) bên dưới.
    const sel = selected;

    const isObject = sel.kind === "object";
    const objectName = isObject && modelId ? getCatalogItem(modelId)?.name ?? modelId : "";
    const thumbnail = isObject && modelId ? getCatalogItem(modelId)?.thumbnailUrl : undefined;
    const headerTitle = sel.kind === "object" ? (objectName || "Object")
        : sel.kind === "wall" ? "Tường" : "Sàn";

    // Slot active cho object: ưu tiên lựa chọn người dùng nếu còn hợp lệ, else slot đầu tiên.
    const effectiveSlotId = (selectedSlotId && slots.some((s) => s.id === selectedSlotId))
        ? selectedSlotId
        : slots[0]?.id ?? null;
    const activeSlot = slots.find((s) => s.id === effectiveSlotId) ?? null;

    function handleSlotPick(materialId: string) {
        if (!engine || !isObject || !effectiveSlotId) return;
        const slotId = effectiveSlotId;
        engine.api.transaction("change material", () => {
            engine.api.dispatch({ type: "APPLY_FURNITURE_MATERIAL", entityId: sel.id, slotId, materialId });
        });
        setSelectedBySlot((prev) => ({ ...prev, [slotId]: materialId }));
    }

    /** Đổi material cho MẶT tường đang chọn (selectedFace). */
    function handleWallPick(materialId: string) {
        if (!engine || sel.kind !== "wall") return;
        const face = selectedFace;
        engine.api.transaction("change wall material", () => {
            engine.api.dispatch({ type: "SET_WALL_MATERIAL", wallId: sel.id, materialId, face });
        });
        setWallFaceMat((p) => ({ ...p, [face]: materialId }));
    }

    /** Đổi material sàn phòng. */
    function handleFloorPick(materialId: string) {
        if (!engine || sel.kind !== "room") return;
        engine.api.transaction("change floor material", () => {
            engine.api.dispatch({ type: "SET_FLOOR_MATERIAL", roomKey: sel.id, materialId });
        });
        setFloorMaterialId(materialId);
    }

    /** Khôi phục material gốc (GLB) cho slot đang chọn của object. */
    function handleSlotReset() {
        if (!engine || !isObject || !effectiveSlotId) return;
        const slotId = effectiveSlotId;
        engine.api.transaction("reset material", () => {
            engine.api.dispatch({ type: "RESET_FURNITURE_MATERIAL", entityId: sel.id, slotId });
        });
        setSelectedBySlot((prev) => {
            const next = { ...prev };
            delete next[slotId];
            return next;
        });
    }

    /** Khôi phục material mặc định cho MẶT tường đang chọn. */
    function handleWallReset() {
        if (!engine || sel.kind !== "wall") return;
        const face = selectedFace;
        engine.api.transaction("reset wall material", () => {
            engine.api.dispatch({ type: "RESET_WALL_MATERIAL", wallId: sel.id, face });
        });
        setWallFaceMat((p) => ({ ...p, [face]: null }));
    }

    /** Khôi phục material mặc định cho sàn phòng. */
    function handleFloorReset() {
        if (!engine || sel.kind !== "room") return;
        engine.api.transaction("reset floor material", () => {
            engine.api.dispatch({ type: "RESET_FLOOR_MATERIAL", roomKey: sel.id });
        });
        setFloorMaterialId(null);
    }

    return (
        <aside
            role="dialog"
            aria-label="Material Editor"
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
                {selected.kind === "object" ? (
                    slots.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: T.onSurfaceVariant, opacity: 0.8 }}>
                            Object này chưa hỗ trợ đổi material.
                        </div>
                    ) : (
                        <>
                            {/* Preview thumbnail object — compact landscape banner */}
                            {thumbnail && (
                                <div
                                    style={{
                                        position: "relative",
                                        width: "100%",
                                        height: 56,
                                        borderRadius: 12,
                                        overflow: "hidden",
                                        border: "1px solid rgba(213,196,172,0.5)",
                                        background: "#f7f3ea",
                                        flexShrink: 0,
                                    }}
                                >
                                    <img
                                        src={thumbnail}
                                        alt={objectName}
                                        style={{
                                            position: "absolute", inset: 0,
                                            width: "100%", height: "100%",
                                            objectFit: "cover",
                                            pointerEvents: "none",
                                        }}
                                    />
                                    {/* Gradient overlay + object name */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            background: "linear-gradient(to right, rgba(0,0,0,0.45) 0%, transparent 60%)",
                                            display: "flex",
                                            alignItems: "center",
                                            paddingLeft: 12,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontFamily: "Cinzel, serif",
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: "#fff",
                                                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                maxWidth: "80%",
                                            }}
                                        >
                                            {objectName}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Part Selection */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {/* Section label with divider */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                            Part Selection
                                        </span>
                                        <span style={{ fontSize: 10, color: "#837560" }}>{slots.length} Parts</span>
                                    </div>
                                    <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                                </div>
                                {slots.map((s) => {
                                    const isSel = s.id === effectiveSlotId;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => setSelectedSlotId(s.id)}
                                            style={{
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                padding: "10px 12px",
                                                background: isSel ? alpha(RGB.primaryContainer, 0.18) : "transparent",
                                                border: isSel ? `1px solid ${alpha(RGB.primaryContainer, 0.5)}` : "1px solid transparent",
                                                borderLeft: isSel ? `3px solid ${T.primary}` : "3px solid transparent",
                                                borderRadius: 12,
                                                cursor: "pointer",
                                                textAlign: "left",
                                                transition: "background 0.15s, border-color 0.15s",
                                            }}
                                            onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = alpha(RGB.primaryContainer, 0.08); }}
                                            onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 9999, background: isSel ? T.primary : "rgba(213,196,172,0.8)", flexShrink: 0 }} />
                                                <span style={{
                                                    fontSize: isSel ? 15 : 14,
                                                    fontWeight: isSel ? 700 : 400,
                                                    color: isSel ? T.onSurface : T.onSurfaceVariant,
                                                    transition: "font-size 0.15s, font-weight 0.15s",
                                                }}>{s.label}</span>
                                            </div>
                                            {selectedBySlot[s.id] && (
                                                <span style={{ fontSize: 10, color: "#837560", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {selectedBySlot[s.id]}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Material grid cho slot đang chọn */}
                            {activeSlot && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                                        <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                                        <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                            Material · {activeSlot.label}
                                        </span>
                                        <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                                        <ResetButton onClick={handleSlotReset} />
                                    </div>
                                    <MaterialGrid
                                        allowedCategories={activeSlot.allowedCategories}
                                        selectedId={selectedBySlot[activeSlot.id] ?? null}
                                        onPick={handleSlotPick}
                                    />
                                </div>
                            )}
                        </>
                    )
                ) : selected.kind === "wall" ? (
                    /* Tường: 2 mặt sơn riêng (slot-list, clone Part Selection của object). */
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
                                allowedCategories={WALL_CATEGORIES}
                                selectedId={wallFaceMat[selectedFace]}
                                onPick={handleWallPick}
                            />
                        </div>
                    </>
                ) : (
                    /* Sàn phòng — 1 surface, không có slot. */
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                            <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                            <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                Material · Bề mặt sàn
                            </span>
                            <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                            <ResetButton onClick={handleFloorReset} />
                        </div>
                        <MaterialGrid
                            allowedCategories={FLOOR_CATEGORIES}
                            selectedId={floorMaterialId}
                            onPick={handleFloorPick}
                        />
                    </div>
                )}
            </div>
        </aside>
    );
}
