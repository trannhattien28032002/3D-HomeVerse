/**
 * ShortcutsModal — bảng tra cứu TOÀN BỘ phím tắt + tương tác chuột của editor.
 *
 * Mở/đóng bằng phím `?` (Shift+/), đóng thêm bằng Esc hoặc click nền. Tự đăng ký
 * listener phím `?` của riêng nó (luôn mount cùng EditorPage) nên không phụ thuộc các
 * hook phím tắt khác.
 *
 * Nội dung được tổng hợp khớp với code thực tế:
 *   - Phím chung:  useEditorShortcuts (Ctrl+S/Shift+S/O/C/V, Tab, F)
 *   - Phím 3D:     useEditorShortcuts (Q/W/Esc) + GizmoSystem (Delete/Backspace)
 *   - Phím 2D:     usePlanShortcuts (Delete, Ctrl+A/Z/Shift+Z/Y, Esc, F lật cửa) + V/B
 *   - Chuột 3D:    OrbitControlSystem + GizmoPicking
 *   - Chuột 2D:    usePlanInput (wheel zoom, chuột-phải pan, marquee, delegate tool)
 */
import { useEffect } from "react";
import { T, RGB, alpha } from "../../../constants/designTokens";
import { useUIStore } from "../../../store/useUIStore";
import { isTypingTarget } from "src/shared/dom/isTypingTarget";

/** Một dòng: tổ hợp phím (mỗi phần tử là 1 phím) → mô tả. */
type Row = { keys: string[]; desc: string };
type Section = { icon: string; title: string; rows: Row[] };

const SECTIONS: Section[] = [
    {
        icon: "keyboard_command_key",
        title: "Chung — dùng mọi lúc",
        rows: [
            { keys: ["Tab"], desc: "Chuyển đổi giữa chế độ 3D và mặt bằng 2D" },
            { keys: ["F"], desc: "Mở / đóng danh mục nội thất (Decor)" },
            { keys: ["Ctrl", "S"], desc: "Lưu thiết kế lên máy chủ" },
            { keys: ["Ctrl", "Shift", "S"], desc: "Xuất file .homeverseplan về máy" },
            { keys: ["Ctrl", "O"], desc: "Mở file thiết kế từ máy" },
            { keys: ["Ctrl", "C"], desc: "Sao chép vật đang chọn" },
            { keys: ["Ctrl", "V"], desc: "Dán bản sao (mỗi lần lệch chéo dần)" },
            { keys: ["?"], desc: "Mở / đóng bảng phím tắt này" },
        ],
    },
    {
        icon: "view_in_ar",
        title: "Chế độ 3D",
        rows: [
            { keys: ["Q"], desc: "Công cụ Di chuyển (Move) vật đang chọn" },
            { keys: ["W"], desc: "Công cụ Xoay (Rotate) vật đang chọn" },
            { keys: ["Delete"], desc: "Xoá vật đang chọn" },
            { keys: ["Backspace"], desc: "Xoá vật đang chọn (tương đương Delete)" },
            { keys: ["Esc"], desc: "Huỷ khi đang đặt một vật mới" },
        ],
    },
    {
        icon: "view_quilt",
        title: "Chế độ 2D (mặt bằng)",
        rows: [
            { keys: ["V"], desc: "Công cụ Chọn (Select)" },
            { keys: ["B"], desc: "Công cụ Vẽ tường (Build) — tự chuyển sang 2D" },
            { keys: ["Delete"], desc: "Xoá tường / vật đang chọn" },
            { keys: ["Ctrl", "A"], desc: "Chọn tất cả (khi đang ở công cụ Chọn)" },
            { keys: ["Ctrl", "Z"], desc: "Hoàn tác (Undo)" },
            { keys: ["Ctrl", "Shift", "Z"], desc: "Làm lại (Redo)" },
            { keys: ["Ctrl", "Y"], desc: "Làm lại (Redo)" },
            { keys: ["F"], desc: "Lật hướng cửa / cửa sổ đang chọn" },
            { keys: ["Esc"], desc: "Huỷ thao tác đang vẽ & bỏ chọn" },
        ],
    },
];

/** Tương tác chuột — tách riêng vì 'phím' là cử chỉ, không phải ký tự. */
const MOUSE_3D: Row[] = [
    { keys: ["Chuột trái"], desc: "Bấm: chọn vật / tường / sàn · Kéo nền: xoay góc nhìn · Kéo mũi tên gizmo: di chuyển/xoay vật" },
    { keys: ["Chuột phải"], desc: "Bấm: bỏ chọn · Kéo: di chuyển khung nhìn (pan)" },
    { keys: ["Lăn chuột"], desc: "Phóng to / thu nhỏ về phía con trỏ" },
    { keys: ["Bấm đúp"], desc: "Đưa tâm xoay tới điểm vừa bấm" },
];

const MOUSE_2D: Row[] = [
    { keys: ["Chuột trái"], desc: "Bấm: chọn · Kéo trên vật/tường: di chuyển · Kéo trên nền: chọn vùng (marquee) · Công cụ Vẽ: bấm lần lượt các điểm tường" },
    { keys: ["Shift", "+ kéo"], desc: "Chọn vùng cộng dồn vào lựa chọn hiện có" },
    { keys: ["Chuột phải"], desc: "Kéo: di chuyển khung nhìn (pan) · (chuột giữa cũng pan)" },
    { keys: ["Lăn chuột"], desc: "Phóng to / thu nhỏ về phía con trỏ" },
];

export default function ShortcutsModal() {
    const isOpen = useUIStore((s) => s.isShortcutsOpen);
    const toggle = useUIStore((s) => s.toggleShortcuts);
    const close = useUIStore((s) => s.closeShortcuts);

    // Phím `?` mở/đóng; Esc đóng. Bỏ qua khi đang gõ trong ô nhập.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "?" && !isTypingTarget(e.target)) {
                e.preventDefault();
                toggle();
                return;
            }
            if (e.key === "Escape" && isOpen) close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, toggle, close]);

    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Bảng phím tắt"
            onClick={close}
            style={{
                position: "fixed", inset: 0, zIndex: 9000,
                background: "rgba(28,28,23,0.45)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "rgba(253,249,240,0.98)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${T.outlineVariant}`,
                    borderRadius: 20,
                    boxShadow: `0 24px 64px ${alpha(RGB.primary, 0.22)}, 0 4px 16px ${alpha(RGB.primary, 0.10)}`,
                    width: 760,
                    maxWidth: "calc(100vw - 32px)",
                    maxHeight: "calc(100vh - 64px)",
                    display: "flex", flexDirection: "column",
                    fontFamily: "'Nunito Sans', sans-serif",
                }}
            >
                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "22px 26px 16px",
                    borderBottom: `1px solid ${T.outlineVariant}`,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: T.primary, fontVariationSettings: "'FILL' 1" }}>
                            keyboard
                        </span>
                        <span style={{ fontSize: 17, fontWeight: 700, color: T.onSurface, letterSpacing: "0.01em" }}>
                            Phím tắt & tương tác chuột
                        </span>
                    </div>
                    <button
                        aria-label="Đóng"
                        onClick={close}
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

                {/* Body — 2 cột co giãn */}
                <div style={{
                    padding: "20px 26px 24px",
                    overflowY: "auto",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                    gap: "20px 28px",
                    alignContent: "start",
                }}>
                    {SECTIONS.map((s) => (
                        <KeySection key={s.title} icon={s.icon} title={s.title} rows={s.rows} />
                    ))}
                    <KeySection icon="mouse" title="Chuột — chế độ 3D" rows={MOUSE_3D} wide />
                    <KeySection icon="mouse" title="Chuột — chế độ 2D" rows={MOUSE_2D} wide />
                </div>

                {/* Footer */}
                <div style={{
                    padding: "12px 26px",
                    borderTop: `1px solid ${T.outlineVariant}`,
                    fontSize: 11.5, color: T.onSurfaceVariant, textAlign: "center",
                }}>
                    Nhấn <kbd style={kbdStyle}>?</kbd> để mở lại bảng này bất cứ lúc nào · <kbd style={kbdStyle}>Esc</kbd> để đóng
                </div>
            </div>
        </div>
    );
}

function KeySection({ icon, title, rows, wide }: Section & { wide?: boolean }) {
    return (
        <section style={wide ? { gridColumn: "1 / -1" } : undefined}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primary }}>{icon}</span>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.onSurface, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                    {title}
                </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                        <span style={{ flex: "0 0 132px", display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-start" }}>
                            {r.keys.map((k, j) => (
                                <kbd key={j} style={kbdStyle}>{k}</kbd>
                            ))}
                        </span>
                        <span style={{ flex: 1, fontSize: 12.5, color: T.onSurfaceVariant, lineHeight: 1.5 }}>
                            {r.desc}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

const kbdStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 7px",
    borderRadius: 5,
    border: "1px solid rgba(213,196,172,0.85)",
    borderBottomWidth: 2,
    background: "rgba(255,252,245,0.95)",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: 700,
    color: T.onSurface,
    whiteSpace: "nowrap",
};
