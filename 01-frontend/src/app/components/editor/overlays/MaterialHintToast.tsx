import { T, RGB, alpha } from "src/app/constants/designTokens";

/**
 * Toast gợi ý "chọn một object/tường/sàn để đổi material" — hiện khi người dùng
 * bấm đổi màu mà chưa chọn gì. Thuần trình bày; cha điều khiển hiển thị bằng cách
 * mount/unmount (xem EditorPage `showMaterialHint`).
 */
export default function MaterialHintToast() {
    return (
        <div
            style={{
                position: "fixed",
                bottom: 100,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 50,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 9999,
                background: "rgba(241,238,229,0.95)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${alpha(RGB.primaryContainer, 0.45)}`,
                boxShadow: `0 4px 20px ${alpha(RGB.primary, 0.18)}`,
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: T.onSurfaceVariant,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
                animation: "fadeInUp 0.2s ease",
            }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primaryContainer, lineHeight: 1 }}>
                touch_app
            </span>
            Chọn một object, tường, hoặc sàn để đổi material
        </div>
    );
}
