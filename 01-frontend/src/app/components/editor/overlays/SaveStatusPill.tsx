/**
 * SaveStatusPill — chỉ báo trạng thái lưu scene lên backend (P1).
 *
 * Hiển thị "Đang lưu… / Đã lưu / Lỗi" theo saveState từ useScenePersistence.
 * Khi idle: nút "Lưu" (Ctrl+S) gọn để lưu tay. Click khi lỗi → thử lại.
 */
import { T, RGB, alpha } from "src/app/constants/designTokens";
import type { SaveState } from "src/app/pages/EditorPage/useScenePersistence";

type Props = {
    state: SaveState;
    onSave: () => void;
};

const PILL: React.CSSProperties = {
    position: "fixed",
    top: 64,
    right: 16,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 9999,
    background: "rgba(253,249,240,0.95)",
    border: `1px solid ${T.outlineVariant}`,
    boxShadow: `0 2px 10px ${alpha(RGB.primary, 0.14)}`,
    fontFamily: "'Nunito Sans', sans-serif",
    fontSize: 12.5,
    fontWeight: 700,
    userSelect: "none",
};

export default function SaveStatusPill({ state, onSave }: Props) {
    if (state === "saving") {
        return (
            <div style={{ ...PILL, color: T.onSurfaceVariant, cursor: "default" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, animation: "spin 0.8s linear infinite" }}>
                    progress_activity
                </span>
                Đang lưu…
            </div>
        );
    }

    if (state === "saved") {
        return (
            <div style={{ ...PILL, color: "#1a6b3c", cursor: "default" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>
                    cloud_done
                </span>
                Đã lưu
            </div>
        );
    }

    if (state === "error") {
        return (
            <div
                onClick={onSave}
                title="Lưu lại"
                style={{ ...PILL, color: "#b3261e", cursor: "pointer" }}
            >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cloud_off</span>
                Lỗi — Thử lại
            </div>
        );
    }

    // idle
    return (
        <div
            onClick={onSave}
            title="Lưu (Ctrl+S)"
            style={{ ...PILL, color: T.primary, cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = alpha(RGB.primaryContainer, 0.14); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(253,249,240,0.95)"; }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
            Lưu
        </div>
    );
}
