import { T } from "../../constants/designTokens";
import { BOTTOM_NAV } from "../../constants/navigation";
import type { Mode } from "../../constants/navigation";
import type { EngineApi } from "src/engine/engineTypes";

type Props = {
    mode: Mode;
    activeNav: string;
    setMode: (m: Mode) => void;
    setToolMode2D: (m: "select" | "draw") => void;
    engine: EngineApi | null;
    onDecorClick?: () => void;
    gizmoMode?: "translate" | "rotate";
    onGizmoModeChange?: (m: "translate" | "rotate") => void;
};

export default function BottomNavBar({ mode, activeNav, setMode, setToolMode2D, engine, onDecorClick, gizmoMode = "translate", onGizmoModeChange }: Props) {
    const visibleItems = BOTTOM_NAV.filter(item => item.modes.includes(mode));

    return (
        <div style={{
            position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
            zIndex: 50,
            display: "flex", alignItems: "center", gap: 2,
            padding: "6px 12px",
            background: T.surface,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid rgba(248,180,0,0.25)`,
            borderRadius: 9999,
            boxShadow: "0 8px 32px rgba(124,88,0,0.18)",
            maxWidth: "95vw", overflowX: "auto",
        }}>
            {visibleItems.map((item) => {
                if (item.id.startsWith("divider")) {
                    return (
                        <div key={item.id} style={{
                            width: 1, height: 28, margin: "0 6px",
                            background: T.outlineVariant,
                            flexShrink: 0,
                        }} />
                    );
                }

                const isActive = activeNav === item.id;
                return (
                    <button
                        key={item.id}
                        id={`nav-${item.id}`}
                        aria-label={item.label}
                        onClick={() => {
                            if (item.id === "decor") {
                                onDecorClick?.();
                            } else {
                                if (item.action) item.action(setMode, engine);
                            }
                            if (mode === "2d") {
                                if (item.id === "select") setToolMode2D("select");
                                if (item.id === "build") setToolMode2D("draw");
                            }
                            if (item.id === "rotate" || item.id === "translate") {
                                onGizmoModeChange?.(item.id as "rotate" | "translate");
                            }
                        }}
                        style={{
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 2,
                            minWidth: 56,
                            padding: "8px 10px",
                            background: isActive ? T.primaryContainer : "transparent",
                            color: isActive ? T.primary : T.onSurfaceVariant,
                            border: "none", borderRadius: isActive ? 9999 : 12,
                            cursor: "pointer",
                            boxShadow: isActive ? `0 0 12px rgba(248,180,0,0.35)` : "none",
                            transition: "all 0.2s",
                            transform: isActive ? "scale(0.92)" : "scale(1)",
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                            if (!isActive) {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,180,0,0.15)";
                                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
                            }
                        }}
                        onMouseLeave={e => {
                            if (!isActive) {
                                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                            }
                        }}
                    >
                        <span className="material-symbols-outlined" style={{
                            fontSize: 22,
                            fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                        }}>
                            {item.icon}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
