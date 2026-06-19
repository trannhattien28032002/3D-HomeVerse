import { T, RGB, alpha } from "src/app/constants/designTokens";

/** Gợi ý nổi khi đang đặt vật phụ thuộc tường — click vào tường để đặt. */
export default function WallPlacementHint() {
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
                background: "rgba(241,238,229,0.92)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${alpha(RGB.primaryContainer, 0.40)}`,
                boxShadow: `0 4px 20px ${alpha(RGB.primary, 0.18)}`,
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#504532",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
            }}
        >
            <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: T.primaryContainer, lineHeight: 1 }}
            >
                push_pin
            </span>
            Click on a wall to place
            <span style={{ color: "#d5c4ac" }}>·</span>
            Right-click or
            <kbd
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 7px",
                    borderRadius: 5,
                    background: "#fdf9f0",
                    border: "1px solid #d5c4ac",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#504532",
                }}
            >
                Esc
            </kbd>
            to cancel
        </div>
    );
}
