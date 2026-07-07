import { useEffect } from "react";
import { T, RGB, alpha } from "../../../constants/designTokens";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    onLoad: () => void;
};

export default function SaveLoadModal({ isOpen, onClose, onSave, onLoad }: Props) {
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSave = () => { onSave(); onClose(); };
    const handleLoad = () => { onLoad(); onClose(); };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Lưu / Tải bản thiết kế"
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(28,28,23,0.45)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "rgba(253,249,240,0.97)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${T.outlineVariant}`,
                    borderRadius: 20,
                    boxShadow: `0 24px 64px ${alpha(RGB.primary, 0.22)}, 0 4px 16px ${alpha(RGB.primary, 0.10)}`,
                    width: 480,
                    maxWidth: "calc(100vw - 32px)",
                    padding: "28px 28px 24px",
                    fontFamily: "'Nunito Sans', sans-serif",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 24, color: T.primary, fontVariationSettings: "'FILL' 1" }}
                        >
                            folder_open
                        </span>
                        <span style={{ fontSize: 17, fontWeight: 700, color: T.onSurface, letterSpacing: "0.01em" }}>
                            Lưu / Tải bản thiết kế
                        </span>
                    </div>
                    <button
                        aria-label="Đóng"
                        onClick={onClose}
                        style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: T.onSurfaceVariant, borderRadius: 9999,
                            width: 32, height: 32,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = alpha(RGB.primary, 0.10); }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                    </button>
                </div>

                {/* Action cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                    {/* Save card */}
                    <ActionCard
                        icon="save"
                        title="Lưu xuống máy"
                        description="Xuất file .homeverseplan để lưu bản thiết kế hiện tại"
                        buttonLabel="Lưu"
                        buttonIcon="download"
                        onClick={handleSave}
                        accent={T.primary}
                    />
                    {/* Load card */}
                    <ActionCard
                        icon="upload_file"
                        title="Tải từ máy"
                        description="Mở file .homeverseplan đã lưu trước đó"
                        buttonLabel="Tải lên"
                        buttonIcon="upload"
                        onClick={handleLoad}
                        accent="#1a6b3c"
                    />
                </div>

                {/* Footer hint */}
                <p style={{
                    margin: 0, fontSize: 11.5, color: T.onSurfaceVariant,
                    textAlign: "center", letterSpacing: "0.01em",
                }}>
                    <kbd style={kbdStyle}>Ctrl</kbd>+<kbd style={kbdStyle}>S</kbd> lưu lên máy chủ &nbsp;·&nbsp; <kbd style={kbdStyle}>Ctrl</kbd>+<kbd style={kbdStyle}>Shift</kbd>+<kbd style={kbdStyle}>S</kbd> xuất file &nbsp;·&nbsp; <kbd style={kbdStyle}>Ctrl</kbd>+<kbd style={kbdStyle}>O</kbd> mở file từ máy
                </p>
            </div>
        </div>
    );
}

type ActionCardProps = {
    icon: string;
    title: string;
    description: string;
    buttonLabel: string;
    buttonIcon: string;
    onClick: () => void;
    accent: string;
};

function ActionCard({ icon, title, description, buttonLabel, buttonIcon, onClick, accent }: ActionCardProps) {
    return (
        <div style={{
            border: `1px solid rgba(213,196,172,0.6)`,
            borderRadius: 14,
            padding: "18px 16px 16px",
            display: "flex", flexDirection: "column", gap: 10,
            background: "rgba(255,252,245,0.8)",
        }}>
            <span
                className="material-symbols-outlined"
                style={{ fontSize: 28, color: accent, fontVariationSettings: "'FILL' 1" }}
            >
                {icon}
            </span>
            <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.onSurface, marginBottom: 4 }}>
                    {title}
                </div>
                <div style={{ fontSize: 12, color: T.onSurfaceVariant, lineHeight: 1.5 }}>
                    {description}
                </div>
            </div>
            <button
                onClick={onClick}
                style={{
                    marginTop: "auto",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: accent, color: "#fff",
                    border: "none", borderRadius: 9999,
                    padding: "8px 16px", cursor: "pointer",
                    fontSize: 13, fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif",
                    transition: "opacity 0.15s, transform 0.1s",
                    boxShadow: `0 2px 8px ${accent}40`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{buttonIcon}</span>
                {buttonLabel}
            </button>
        </div>
    );
}

const kbdStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 5px",
    borderRadius: 4,
    border: "1px solid rgba(213,196,172,0.8)",
    background: "rgba(213,196,172,0.25)",
    fontSize: 10.5,
    fontFamily: "monospace",
    fontWeight: 600,
    color: T.onSurfaceVariant,
};
