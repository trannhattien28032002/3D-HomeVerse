/**
 * TopNavBar — thanh điều hướng trên cùng của editor.
 * Hiển thị: logo "Tiny Home" | mode label (3D Editor / Floor Plan) | action buttons.
 * Mode label thay đổi theo prop `mode` — không có state nội bộ.
 * Nút Grid luân phiên bước lưới snap (SNAP_OPTIONS) — áp dụng ngay cho snap 2D + 3D.
 * Nút Screenshot chụp đúng view đang hiển thị (tự bỏ chọn trước khi chụp) rồi tải về PNG:
 *   - Mode 3D → engine.api.captureScreenshot() (canvas WebGL).
 *   - Mode 2D → hàm screenshot2D do PlanView2D đăng ký vào useUIStore (Konva Stage).
 * Nút Help ("?") chạy lại tour hướng dẫn react-joyride (useUIStore.startTour) — xem EditorTour.
 * Nút Keyboard mở bảng phím tắt (useUIStore.openShortcuts) — xem ShortcutsModal (phím tắt: ?).
 * Nút Logout (A5) gọi signOut() của useAuthStore (Supabase signOut) rồi điều hướng về /login.
 */
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { T, RGB, alpha } from "../../../constants/designTokens";
import type { Mode } from "../../../constants/navigation";
import { useUIStore } from "../../../store/useUIStore";
import { useAuthStore } from "../../../store/useAuthStore";
import { toast } from "../../../store/useToastStore";
import { useEngineOrNull } from "../../../engineBinding/EngineContext";

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
    const openVersions = useUIStore((s) => s.openVersions);
    const startTour = useUIStore((s) => s.startTour);
    const openShortcuts = useUIStore((s) => s.openShortcuts);
    const screenshot2D = useUIStore((s) => s.screenshot2D);
    const signOut = useAuthStore((s) => s.signOut);
    const isVRPresenting = useUIStore((s) => s.isVRPresenting);
    const engine = useEngineOrNull();
    const navigate = useNavigate();

    // VR: chỉ hiện nút khi thiết bị hỗ trợ immersive-vr (Quest, …).
    const [xrSupported, setXrSupported] = useState(false);
    useEffect(() => {
        if (!engine) return;
        let active = true;
        void engine.xr.isSupported().then((ok) => { if (active) setXrSupported(ok); });
        return () => { active = false; };
    }, [engine]);

    /** Vào / ra chế độ đi dạo VR. enter() cần cử chỉ người dùng nên gọi thẳng từ onClick. */
    const handleVR = () => {
        if (!engine) return;
        if (isVRPresenting) {
            void engine.xr.exit().catch((err) => console.error("[VR] exit lỗi:", err));
            return;
        }
        // KHÔNG nuốt lỗi: requestSession có thể reject (chưa cắm kính / runtime PC không
        // sẵn sàng / bị chặn). Phơi ra console + toast để chẩn đoán thay vì "im lặng".
        engine.xr.enter().catch((err: unknown) => {
            console.error("[VR] enter lỗi:", err);
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Không vào được VR: ${msg}`);
        });
    };

    /** Đăng xuất khỏi Supabase rồi điều hướng về /login. */
    const handleLogout = async () => {
        await signOut();
        navigate("/login", { replace: true });
    };

    /** Chụp đúng view hiện hành (2D Konva hoặc 3D WebGL) → tải về PNG (tự bỏ chọn trước). */
    const handleScreenshot = () => {
        const dataUrl = mode === "2d"
            ? screenshot2D?.() ?? null
            : (engine ? engine.api.captureScreenshot() : null);
        if (!dataUrl) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `tiny-home-${mode}-${stamp}.png`;
        a.click();
    };

    /** Nút chụp khả dụng khi nguồn ảnh tương ứng với mode đã sẵn sàng. */
    const canScreenshot = mode === "2d" ? !!screenshot2D : !!engine;

    const hoverIn = (e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = alpha(RGB.primaryContainer, 0.15);
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
            boxShadow: `0 0 15px ${alpha(RGB.primaryContainer, 0.10)}`,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                    id="topnav-back"
                    aria-label="Quay lại Projects"
                    title="Quay lại danh sách dự án"
                    onClick={() => navigate("/projects")}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
                </button>

                <span style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: 20, fontWeight: 700,
                    color: T.primary,
                    letterSpacing: "0.02em",
                }}>
                    Tiny Home
                </span>
            </div>

            <span style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 12, fontWeight: 600,
                color: T.onSurfaceVariant,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                pointerEvents: "none",
            }}>
                {mode === "3d" ? "3D Editor" : "Floor Plan"}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {xrSupported && (
                    <button
                        id="topnav-vr"
                        aria-label="Đi dạo bằng kính VR"
                        title="Đi dạo trong scene bằng kính VR (Quest 3…)"
                        onClick={handleVR}
                        style={{
                            background: isVRPresenting ? alpha(RGB.primaryContainer, 0.20) : "transparent",
                            border: "none",
                            color: isVRPresenting ? T.primary : T.onSurfaceVariant,
                            cursor: "pointer",
                            borderRadius: 9999, width: 36, height: 36,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 0.2s, color 0.2s",
                        }}
                        onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>view_in_ar</span>
                    </button>
                )}

                <button
                    id="topnav-screenshot"
                    aria-label={mode === "2d" ? "Chụp ảnh mặt bằng 2D" : "Chụp ảnh khung cảnh 3D"}
                    title={mode === "2d" ? "Chụp ảnh mặt bằng 2D" : "Chụp ảnh khung cảnh 3D"}
                    onClick={handleScreenshot}
                    disabled={!canScreenshot}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: canScreenshot ? "pointer" : "default",
                        opacity: canScreenshot ? 1 : 0.5,
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>photo_camera</span>
                </button>

                <button
                    id="topnav-saveload"
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
                    id="topnav-versions"
                    aria-label="Lịch sử phiên bản"
                    title="Lịch sử phiên bản"
                    onClick={openVersions}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>history</span>
                </button>

                <button
                    id="topnav-grid"
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

                <button
                    id="topnav-help"
                    aria-label="Hướng dẫn sử dụng"
                    title="Xem lại hướng dẫn sử dụng"
                    onClick={startTour}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>help</span>
                </button>

                <button
                    id="topnav-shortcuts"
                    aria-label="Bảng phím tắt"
                    title="Phím tắt & thao tác chuột (?)"
                    onClick={openShortcuts}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>keyboard</span>
                </button>

                <button
                    id="topnav-ai"
                    aria-label="AI Assistant"
                    title="AI Architect Assistant"
                    onClick={toggleChatbot}
                    style={{
                        background: isChatbotOpen ? alpha(RGB.primaryContainer, 0.20) : "transparent",
                        border: "none",
                        color: isChatbotOpen ? T.primary : T.onSurfaceVariant,
                        cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                        boxShadow: isChatbotOpen ? `0 0 0 2px ${alpha(RGB.primaryContainer, 0.45)}` : "none",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = isChatbotOpen ? alpha(RGB.primaryContainer, 0.28) : alpha(RGB.primaryContainer, 0.15);
                        e.currentTarget.style.color = T.primary;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = isChatbotOpen ? alpha(RGB.primaryContainer, 0.20) : "transparent";
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

                <button
                    id="topnav-logout"
                    aria-label="Đăng xuất"
                    title="Đăng xuất"
                    onClick={handleLogout}
                    style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                    onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>logout</span>
                </button>
            </div>
        </nav>
    );
}
