/**
 * EntityCounter — pill nhỏ hiển thị số đồ nội thất hiện có / trần (chống spam).
 *
 * Nguồn reactive: engine "snapshot" event đã mang sẵn furniture[] (đồ sàn + đồ bám
 * tường) → đếm length, không đọc ECS trực tiếp. Đổi màu theo mức đầy:
 *   < 90%  : trung tính (kem)
 *   ≥ 90%  : cảnh báo (hổ phách)
 *   = trần : đỏ (đầy, không đặt thêm được)
 *
 * Trần lấy từ engine/utils/furnitureLimit để UI và guard luôn cùng một con số.
 */
import { useCallback, useSyncExternalStore } from "react";
import { T, RGB, alpha } from "src/app/constants/designTokens";
import { useEngineOrNull } from "src/app/engineBinding/EngineContext";
import { MAX_FURNITURE_ENTITIES } from "src/engine/utils/furnitureLimit";

export default function EntityCounter() {
    const engine = useEngineOrNull();

    // useSyncExternalStore: subscribe vào EventBus engine (external store) đúng chuẩn —
    // không setState-trong-effect. getSnapshot trả primitive number → so sánh Object.is
    // ổn định, không tearing. lastSnapshot là cache nên mount sau khi tải vẫn ra số ngay.
    const subscribe = useCallback(
        (onChange: () => void) => (engine ? engine.api.events.on("snapshot", onChange) : () => {}),
        [engine],
    );
    const getSnapshot = useCallback(
        () => engine?.api.events.lastSnapshot?.furniture.length ?? 0,
        [engine],
    );
    const count = useSyncExternalStore(subscribe, getSnapshot);

    if (!engine) return null;

    const ratio = count / MAX_FURNITURE_ENTITIES;
    const atLimit = count >= MAX_FURNITURE_ENTITIES;
    const warning = ratio >= 0.9;

    const palette = atLimit
        ? { bg: "rgba(253,232,232,0.95)", border: "rgba(220,38,38,0.5)", fg: "#b91c1c", icon: "#dc2626" }
        : warning
        ? { bg: "rgba(254,249,231,0.95)", border: alpha(RGB.primaryContainer, 0.5), fg: "#92600a", icon: T.primaryContainer }
        : { bg: "rgba(241,238,229,0.95)", border: alpha(RGB.primary, 0.18), fg: "#504532", icon: "#7c7259" };

    return (
        <div
            title={atLimit ? `Đã đạt trần ${MAX_FURNITURE_ENTITIES} đồ nội thất` : `${count}/${MAX_FURNITURE_ENTITIES} đồ nội thất`}
            style={{
                position: "fixed",
                bottom: 16,
                left: 16,
                zIndex: 40,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 9999,
                background: palette.bg,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${palette.border}`,
                boxShadow: `0 4px 20px ${alpha(RGB.primary, 0.12)}`,
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                color: palette.fg,
                whiteSpace: "nowrap",
                userSelect: "none",
                pointerEvents: "auto",
            }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: palette.icon, lineHeight: 1 }}>
                chair
            </span>
            {count}
            <span style={{ opacity: 0.55, fontWeight: 600 }}>/ {MAX_FURNITURE_ENTITIES}</span>
        </div>
    );
}
