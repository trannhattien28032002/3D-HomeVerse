/**
 * ObjectMaterialPanel — nhánh "object" của MaterialSidebar: GLB nhiều slot.
 *
 * "Part Selection" (materialSlots) → MaterialGrid lọc theo allowedCategories →
 * APPLY_FURNITURE_MATERIAL / RESET_FURNITURE_MATERIAL (đổi sub-mesh). State per-slot
 * (selectedSlotId/selectedBySlot) khởi tạo từ engine khi mount; reset khi đổi target
 * nhờ MaterialSidebar remount qua `key` (EditorPage). Tách từ index.tsx (Phase 5.6).
 */
import { useMemo, useState } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import { getCatalogItem, getMaterialSlots } from "src/engine/catalog/FurnitureCatalog";
import { resolveAssetUrl } from "src/shared/catalog/assetUrl";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import { MaterialGrid } from "./MaterialGrid";
import { ResetButton } from "./ResetButton";

type Props = {
    engine: EngineInstance | null;
    entityId: string;
    modelId: string | null;
};

export function ObjectMaterialPanel({ engine, entityId, modelId }: Props) {
    const slots = useMemo(() => (modelId ? getMaterialSlots(modelId) : []), [modelId]);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string>>(() =>
        engine ? engine.api.getEntityMaterials(entityId) : {}
    );

    if (slots.length === 0) {
        return (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: T.onSurfaceVariant, opacity: 0.8 }}>
                Object này chưa hỗ trợ đổi material.
            </div>
        );
    }

    const objectName = modelId ? getCatalogItem(modelId)?.name ?? modelId : "";
    const thumbnail = modelId ? resolveAssetUrl(getCatalogItem(modelId)?.thumbnailUrl) : undefined;

    // Slot active: ưu tiên lựa chọn người dùng nếu còn hợp lệ, else slot đầu tiên.
    const effectiveSlotId = (selectedSlotId && slots.some((s) => s.id === selectedSlotId))
        ? selectedSlotId
        : slots[0]?.id ?? null;
    const activeSlot = slots.find((s) => s.id === effectiveSlotId) ?? null;

    function handleSlotPick(materialId: string) {
        if (!engine || !effectiveSlotId) return;
        const slotId = effectiveSlotId;
        engine.api.transaction("change material", () => {
            engine.api.dispatch({ type: "APPLY_FURNITURE_MATERIAL", entityId, slotId, materialId });
        });
        setSelectedBySlot((prev) => ({ ...prev, [slotId]: materialId }));
    }

    function handleSlotReset() {
        if (!engine || !effectiveSlotId) return;
        const slotId = effectiveSlotId;
        engine.api.transaction("reset material", () => {
            engine.api.dispatch({ type: "RESET_FURNITURE_MATERIAL", entityId, slotId });
        });
        setSelectedBySlot((prev) => {
            const next = { ...prev };
            delete next[slotId];
            return next;
        });
    }

    return (
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
    );
}
