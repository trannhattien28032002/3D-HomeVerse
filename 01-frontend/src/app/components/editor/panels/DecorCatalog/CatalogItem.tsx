/**
 * Card đơn lẻ trong Decor Catalog.
 *
 * - Hiển thị ảnh thumbnail nếu thumbnailUrl tồn tại và load thành công.
 *   imgFailed fallback về icon "chair" khi ảnh lỗi.
 * - Stagger entrance animation: delay = min(index * 30ms, 360ms) để các item
 *   xuất hiện lần lượt thay vì bùng lên cùng lúc.
 * - Hover effect dùng inline style imperative (onMouseEnter/Leave) thay vì
 *   CSS :hover để tránh conflict với animation class.
 */
import { useState } from "react";

type ItemProps = {
  thumbnailUrl?: string;
  name: string;
  index: number;
  wallConstrained?: boolean;
  onClick: () => void;
};

export function CatalogItem({ thumbnailUrl, name, index, wallConstrained, onClick }: ItemProps) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Stagger entrance: 30ms per item, capped at 360ms so later items don't lag.
  const delay = Math.min(index * 30, 360);
  const hasImage = !!thumbnailUrl && !imgFailed;

  return (
    <button
      onClick={onClick}
      aria-label={name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="decor-item-anim"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px 10px",
        aspectRatio: "1 / 1",
        borderRadius: 16,
        background: hovered ? "rgba(248,180,0,0.10)" : "#fdf9f0",
        border: hovered ? "1px solid #7c5800" : "1px solid #d5c4ac",
        cursor: "pointer",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 8px 24px rgba(124,88,0,0.16)"
          : "0 1px 3px rgba(124,88,0,0.06)",
        transition: "background 0.18s, border-color 0.18s, transform 0.18s, box-shadow 0.18s",
        gap: 8,
        animationDelay: `${delay}ms`,
      }}
    >
      {wallConstrained && (
        <div
          title="Wall-mounted — place on a wall"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#f8b400",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 4px rgba(124,88,0,0.30)",
            zIndex: 1,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 12,
              color: "#fff",
              lineHeight: 1,
              fontVariationSettings: "'FILL' 1, 'wght' 600",
            }}
          >
            push_pin
          </span>
        </div>
      )}
      <div
        style={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasImage ? (
          <img
            src={thumbnailUrl}
            alt=""
            draggable={false}
            onError={() => setImgFailed(true)}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ) : (
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 40,
              color: hovered ? "#7c5800" : "#837560",
              transition: "color 0.18s",
              lineHeight: 1,
              fontVariationSettings: "'FILL' 0, 'wght' 300",
            }}
          >
            chair
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: "'Nunito Sans', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          lineHeight: "15px",
          color: "#1c1c17",
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        {name}
      </span>
    </button>
  );
}
