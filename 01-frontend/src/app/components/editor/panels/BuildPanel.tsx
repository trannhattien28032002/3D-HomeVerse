/**
 * BuildPanel — panel chọn loại tường, hiện ra khi nav "build" đang active (chế độ 2D).
 *
 * Hiện chỉ "Straight" hoạt động; "Curved"/"Freehand" là placeholder (disabled,
 * "Coming soon"). Panel trượt lên khi mở (animation bottom + opacity). Component
 * thuần trình bày — chưa nối logic chọn loại tường vào tool vẽ.
 */
import { T, RGB, alpha } from "src/app/constants/designTokens";

type Props = { activeNav: string };

const WALL_TYPES = [
    {
        id: "curved",
        label: "Curved",
        icon: (
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                <path d="M2 12 Q14 2 26 12" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            </svg>
        ),
    },
    {
        id: "freehand",
        label: "Freehand",
        icon: (
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                <path d="M2 12 C6 4, 10 14, 14 8 S22 4, 26 10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            </svg>
        ),
    },
] as const;

export default function BuildPanel({ activeNav }: Props) {
    const isOpen = activeNav === "build";

    return (
        <div style={{
            position: "fixed",
            bottom: isOpen ? 92 : 72,
            left: "50%", transform: "translateX(-50%)",
            zIndex: 49,
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? "auto" : "none",
            transition: "bottom 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease",
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px",
            background: "rgba(253,249,240,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${alpha(RGB.primaryContainer, 0.3)}`,
            borderRadius: 20,
            boxShadow: `0 4px 24px ${alpha(RGB.primary, 0.16)}`,
            whiteSpace: "nowrap",
        }}>
            <span style={{
                fontSize: 11, fontWeight: 700,
                color: "#837560", letterSpacing: "0.06em",
                textTransform: "uppercase", marginRight: 4,
            }}>
                Wall Type
            </span>

            <div style={{ width: 1, height: 24, background: "rgba(213,196,172,0.6)", margin: "0 4px" }} />

            <button id="wall-type-straight" style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 4,
                padding: "6px 14px",
                background: T.primaryContainer,
                color: "#1c1c17",
                border: "none", borderRadius: 12,
                cursor: "pointer",
                boxShadow: `0 0 10px ${alpha(RGB.primaryContainer, 0.38)}`,
                fontFamily: "'Nunito Sans', sans-serif",
            }}>
                <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                    <rect x="1" y="6" width="26" height="4" rx="2" fill="currentColor" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>Straight</span>
            </button>

            {WALL_TYPES.map(wt => (
                <button
                    key={wt.id}
                    id={`wall-type-${wt.id}`}
                    title="Coming soon"
                    style={{
                        display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 4,
                        padding: "6px 14px",
                        background: "transparent",
                        color: "#837560",
                        border: "1px dashed rgba(131,117,96,0.4)",
                        borderRadius: 12,
                        cursor: "not-allowed",
                        opacity: 0.55,
                        fontFamily: "'Nunito Sans', sans-serif",
                    }}
                >
                    {wt.icon}
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>{wt.label}</span>
                </button>
            ))}
        </div>
    );
}
