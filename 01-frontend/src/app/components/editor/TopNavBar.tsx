/**
 * TopNavBar — thanh điều hướng trên cùng của editor.
 * Hiển thị: logo "Tiny Home" | mode label (3D Editor / Floor Plan) | action buttons.
 * Mode label thay đổi theo prop `mode` — không có state nội bộ.
 * Action buttons (Screenshot, Grid, Help) hiện chưa có logic — chỉ là UI placeholder.
 */
import { T } from "../../constants/designTokens";
import type { Mode } from "../../constants/navigation";

type Props = { mode: Mode };

export default function TopNavBar({ mode }: Props) {
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

            <div style={{ display: "flex", gap: 4 }}>
                {[
                    { icon: "photo_camera", label: "Screenshot" },
                    { icon: "grid_on",      label: "Grid" },
                    { icon: "help",         label: "Help" },
                ].map(btn => (
                    <button key={btn.icon} aria-label={btn.label} style={{
                        background: "transparent", border: "none",
                        color: T.onSurfaceVariant, cursor: "pointer",
                        borderRadius: 9999, width: 36, height: 36,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                    }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,180,0,0.15)";
                            (e.currentTarget as HTMLButtonElement).style.color = T.primary;
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.color = T.onSurfaceVariant;
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{btn.icon}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
}
