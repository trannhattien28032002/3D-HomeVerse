/**
 * TopNavBar — thanh điều hướng trên cùng của editor.
 * Hiển thị: logo "Tiny Home" | mode label (3D Editor / Floor Plan) | action buttons.
 * Mode label thay đổi theo prop `mode` — không có state nội bộ.
 * Nút Grid luân phiên bước lưới snap (SNAP_OPTIONS) — áp dụng ngay cho snap 2D + 3D.
 * Nút Screenshot chụp khung hình 3D tại vị trí camera hiện tại (tự bỏ chọn trước khi chụp)
 * rồi tải về dạng PNG. Help hiện chưa có logic — chỉ là UI placeholder.
 */
import type { MouseEvent } from "react";
import { T } from "../../../constants/designTokens";
import type { Mode } from "../../../constants/navigation";
import { useUIStore } from "../../../store/useUIStore";
import { useEngineOrNull } from "../../../engine/EngineContext";

type Props = { mode: Mode };


/** Bước lưới (mét) → nhãn ngắn cm. 0.25 → "25". */
function snapCm(m: number): string {
    return `${Math.round(m * 100)}`;
}

export default function TopNavBar({ mode }: Props) {
    const snapM = useUIStore((s) => s.snapM);
    const cycleSnap = useUIStore((s) => s.cycleSnap);
    const isChatbotOpen = useUIStore((s) => s.isChatbotOpen);
    const toggleChatbot = useUIStore((s) => s.toggleChatbot);
    const openSaveLoad = useUIStore((s) => s.openSaveLoad);
    const engine = useEngineOrNull();

    /** Chụp khung hình 3D tại vị trí camera hiện tại → tải về PNG (tự bỏ chọn trước). */
    const handleScreenshot = () => {
        if (!engine) return;
        const dataUrl = engine.api.captureScreenshot();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `tiny-home-${stamp}.png`;
        a.click();
    };

    const hoverIn = (e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "rgba(248,180,0,0.15)";
        e.currentTarget.style.color = T.primary;
    };
    const hoverOut = (e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = T.onSurfaceVariant;
    };

    return (
        <nav style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 30,
            height: 56,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px",
            background: "rgba(253,249,240,0.70)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: `1px solid ${T.outlineVariant}`,
            boxShadow: "0 0 15px rgba(248,180,0,0.10)",
        }}>
            <span style={{
                fontFamily: "Cinzel, serif",
                fontSize: 20, fontWeight: 700,
                color: T.primary,
                letterSpacing: "0.02em",
            }}>
                Tiny Home
            </span>

            <span style={{
                fontSize: 12, fontWeight: 600,
                color: T.onSurfaceVariant,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
            }}>
                {mode === "3d" ? "3D Editor" : "Floor Plan"}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                    aria-label="Chụp ảnh khung cảnh 3D"
                    title="Chụp ảnh khung cảnh 3D"
                    onClick={handleScreenshot}
                    disabled={!engine}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: engine ? "pointer" : "default",
                        opacity: engine ? 1 : 0.5,
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>photo_camera</span>
                </button>

                <button
                    aria-label="Lưu / Tải bản thiết kế"
                    title="Lưu / Tải bản thiết kế"
                    onClick={openSaveLoad}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>folder_open</span>
                </button>

                <button
                    aria-label={`Grid snap ${snapCm(snapM)}cm`}
                    title={`Lưới snap: ${snapCm(snapM)}cm — bấm để đổi`}
                    onClick={cycleSnap}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, height: 36, padding: "0 10px",
                        display: "flex", alignItems: "center", gap: 4,
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>grid_on</span>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.02em" }}>
                        {snapCm(snapM)}<span style={{ fontSize: 9, fontWeight: 600 }}>cm</span>
                    </span>
                </button>

                <button aria-label="Help" style={{
                    background: "transparent", border: "none",
                    color: T.onSurfaceVariant, cursor: "pointer",
                    borderRadius: 9999, width: 36, height: 36,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s, color 0.2s",
                }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>help</span>
                </button>

                <button
                    aria-label="AI Assistant"
                    title="AI Architect Assistant"
                    onClick={toggleChatbot}
                    style={{
                        background: isChatbotOpen ? "rgba(248,180,0,0.20)" : "transparent",
                        border: "none",
                        color: isChatbotOpen ? T.primary : T.onSurfaceVariant,
                        cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                        boxShadow: isChatbotOpen ? "0 0 0 2px rgba(248,180,0,0.45)" : "none",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = isChatbotOpen ? "rgba(248,180,0,0.28)" : "rgba(248,180,0,0.15)";
                        e.currentTarget.style.color = T.primary;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = isChatbotOpen ? "rgba(248,180,0,0.20)" : "transparent";
                        e.currentTarget.style.color = isChatbotOpen ? T.primary : T.onSurfaceVariant;
                    }}
                >
                    <span
                        className="material-symbols-outlined"
                        style={{
                            fontSize: 22,
                            fontVariationSettings: isChatbotOpen ? "'FILL' 1" : "'FILL' 0",
                        }}
                    >
                        auto_awesome
                    </span>
                </button>
            </div>
        </nav>
    );
}
