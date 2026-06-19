/**
 * ResetButton — nút nhỏ "Mặc định" khôi phục material gốc cho slot/bề mặt đang chọn.
 * Dùng chung bởi ObjectMaterialPanel / WallMaterialPanel / FloorMaterialPanel.
 */
import { T } from "src/app/constants/designTokens";

export function ResetButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title="Khôi phục material mặc định"
            className="material-reset-btn"
            style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px",
                borderRadius: 9999,
                cursor: "pointer",
                color: T.onSurfaceVariant,
                fontSize: 11,
                lineHeight: 1,
            }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            Mặc định
        </button>
    );
}
