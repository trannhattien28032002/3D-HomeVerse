/**
 * Toaster — render danh sách toast từ useToastStore, cố định góc dưới-phải.
 * Mount 1 lần ở App root. Click 1 toast để đóng sớm.
 */
import { useToastStore } from "src/app/store/useToastStore";
import type { ToastKind } from "src/app/store/useToastStore";
import { T, RGB, alpha } from "src/app/constants/designTokens";

const ACCENT: Record<ToastKind, string> = {
    success: "#1a6b3c",
    error: "#b3261e",
    info: T.primary,
};

const ICON: Record<ToastKind, string> = {
    success: "check_circle",
    error: "error",
    info: "info",
};

export default function Toaster() {
    const toasts = useToastStore((s) => s.toasts);
    const dismiss = useToastStore((s) => s.dismiss);

    if (toasts.length === 0) return null;

    return (
        <div
            style={{
                position: "fixed",
                bottom: 20,
                right: 20,
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                pointerEvents: "none",
                fontFamily: "'Nunito Sans', sans-serif",
            }}
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    onClick={() => dismiss(t.id)}
                    role="status"
                    style={{
                        pointerEvents: "auto",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 260,
                        maxWidth: 380,
                        padding: "12px 16px",
                        borderRadius: 12,
                        background: "rgba(253,249,240,0.98)",
                        border: `1px solid ${T.outlineVariant}`,
                        borderLeft: `4px solid ${ACCENT[t.kind]}`,
                        boxShadow: `0 8px 28px ${alpha(RGB.primary, 0.18)}`,
                        animation: "toastIn 0.2s ease",
                    }}
                >
                    <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 20, color: ACCENT[t.kind], fontVariationSettings: "'FILL' 1", flexShrink: 0 }}
                    >
                        {ICON[t.kind]}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.onSurface, lineHeight: 1.4 }}>
                        {t.message}
                    </span>
                </div>
            ))}
        </div>
    );
}
