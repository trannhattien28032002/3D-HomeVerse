/**
 * MaterialGrid — lưới thumbnail material để chọn cho một slot / bề mặt.
 *
 * Lọc 2 tầng:
 *   1. allowedCategories của slot (qua materialsForSlot) — tầng cứng.
 *   2. Chip category (state cục bộ) — tầng mềm để rút gọn danh sách dài (28–31 ô
 *      với tường/sàn). Chip chỉ hiện khi có > 1 category trong tập đã lọc.
 *
 * Mỗi ô có ảnh PBR preview + tên; ô đang chọn có viền vàng + badge check. Ảnh lỗi
 * fallback về icon palette để không vỡ layout.
 */
import { useMemo, useState } from "react";
import { materialsForSlot, categoriesOf, categoryLabel, type MaterialItem } from "./materialCatalog";
import { T, RGB, alpha } from "src/app/constants/designTokens";

type Props = {
    allowedCategories: string[];
    selectedId: string | null;
    onPick: (materialId: string) => void;
};

const ALL = "__all__";

export function MaterialGrid({ allowedCategories, selectedId, onPick }: Props) {
    const items = useMemo(() => materialsForSlot(allowedCategories), [allowedCategories]);
    const categories = useMemo(() => categoriesOf(items), [items]);

    const [activeCat, setActiveCat] = useState<string>(ALL);
    // Giữ an toàn nếu category đang chọn không còn hợp lệ (đổi slot không remount).
    const effectiveCat = activeCat !== ALL && categories.includes(activeCat) ? activeCat : ALL;
    const visible = effectiveCat === ALL ? items : items.filter((m) => m.category === effectiveCat);

    if (items.length === 0) {
        return (
            <div style={{ padding: 16, fontSize: 13, color: T.onSurfaceVariant, opacity: 0.7, textAlign: "center" }}>
                Không có material phù hợp.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflow: "visible" }}>
            {categories.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 2 }}>
                    <Chip label="Tất cả" active={effectiveCat === ALL} onClick={() => setActiveCat(ALL)} />
                    {categories.map((c) => (
                        <Chip key={c} label={categoryLabel(c)} active={effectiveCat === c} onClick={() => setActiveCat(c)} />
                    ))}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: 4, margin: -4, overflow: "visible" }}>
                {visible.map((m) => (
                    <MaterialTile key={m.id} item={m} selected={m.id === selectedId} onPick={onPick} />
                ))}
            </div>
        </div>
    );
}

/** Chip lọc category — pill nhỏ, đồng bộ với CategoryTabs của DecorCatalog. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "5px 12px",
                height: 28,
                lineHeight: 1,
                borderRadius: 9999,
                background: active ? T.primaryContainer : "#fdf9f0",
                color: active ? "#674900" : T.onSurfaceVariant,
                border: active ? "1px solid transparent" : "1px solid #d5c4ac",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
                cursor: "pointer",
                boxShadow: active
                    ? `0 0 0 3px ${alpha(RGB.primaryContainer, 0.22)}, 0 2px 8px ${alpha(RGB.primaryContainer, 0.18)}`
                    : "none",
                transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
                flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = alpha(RGB.primaryContainer, 0.16);
                    (e.currentTarget as HTMLButtonElement).style.borderColor = T.primaryContainer;
                }
            }}
            onMouseLeave={(e) => {
                if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#fdf9f0";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#d5c4ac";
                }
            }}
        >
            {label}
        </button>
    );
}

/** Một ô material — ảnh preview + tên, viền vàng + badge khi đang chọn. */
function MaterialTile({ item, selected, onPick }: { item: MaterialItem; selected: boolean; onPick: (id: string) => void }) {
    const [hovered, setHovered] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);

    // Ring vẽ bằng box-shadow INSET (không đổi border-width → lưới không "nhảy" 1px;
    // inset → không bị overflowX:hidden của panel cắt mất viền chọn).
    const ring = hovered
        ? `inset 0 0 0 2px ${T.primaryContainer}, 0 6px 16px ${alpha(RGB.primary, 0.16)}`
        : selected
            ? `inset 0 0 0 2px ${T.primary}`
            : "none";
    return (
        <button
            onClick={() => onPick(item.id)}
            title={item.name}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 6,
                padding: 6,
                width: "100%",
                boxSizing: "border-box",
                minWidth: 0,
                background: selected ? alpha(RGB.primaryContainer, 0.14) : "rgba(255,255,255,0.5)",
                border: "1px solid rgba(213,196,172,0.6)",
                borderRadius: 12,
                cursor: "pointer",
                outline: "none",
                transform: hovered ? "translateY(-2px)" : "translateY(0)",
                boxShadow: ring,
                transition: "transform 0.16s, box-shadow 0.16s, background 0.16s",
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#ece8df",
                }}
            >
                {imgFailed ? (
                    <span
                        className="material-symbols-outlined"
                        style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 26, color: "#a99c86",
                        }}
                    >
                        hide_image
                    </span>
                ) : (
                    <img
                        src={item.icon}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        onError={() => setImgFailed(true)}
                        style={{
                            position: "absolute", inset: 0,
                            width: "100%", height: "100%",
                            objectFit: "cover", display: "block",
                            pointerEvents: "none", userSelect: "none",
                        }}
                    />
                )}
                {/* Depth gradient overlay — visible on hover or selected */}
                {(hovered || selected) && !imgFailed && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.22) 100%)",
                            borderRadius: 8,
                            pointerEvents: "none",
                        }}
                    />
                )}
                {selected && (
                    <span
                        style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            borderRadius: 9999,
                            background: T.primary,
                            color: "#fff",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 13, fontWeight: 700 }}>check</span>
                    </span>
                )}
            </div>
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: selected ? T.primary : T.onSurfaceVariant,
                    lineHeight: 1.2,
                    textAlign: "center",
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {item.name}
            </span>
        </button>
    );
}
