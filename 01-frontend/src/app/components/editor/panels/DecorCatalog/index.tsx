/**
 * DecorCatalog — lớp modal phủ để duyệt và chọn các vật trang trí.
 *
 * Props:
 *   open     — điều khiển hiển thị
 *   onClose  — gọi khi người dùng đóng (nút X, click nền mờ, hoặc phím Esc)
 *   onSelect — gọi kèm id của vật khi một mục trong catalog được click
 *
 * Nguồn dữ liệu: catalogStore (nạp từ backend lúc bootstrap) qua getCatalogEntries()
 * Lọc:          từ khóa tìm kiếm (theo tên, không phân biệt hoa thường) + chip danh mục
 * Bàn phím:     Esc để đóng, điều hướng bằng Tab qua các mục (mặc định của trình duyệt)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { AnimationEvent as ReactAnimationEvent } from "react";
import { T, RGB, alpha } from "src/app/constants/designTokens";

import { catalogVersion } from "src/shared/catalog/catalogStore";
import { getCatalogEntries, getFilterChips, ALL_CATEGORIES, filterCatalog } from "./catalogData";
import { CategoryTabs } from "./CategoryTabs";
import { CatalogGrid } from "./CatalogGrid";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (objectId: string) => void;
};

export default function DecorCatalog({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>(ALL_CATEGORIES);
  // Cờ mount nội bộ — vẫn true trong lúc chạy animation thoát, rồi mới chuyển về false
  const [mounted, setMounted] = useState(isOpen);
  // closing=true sẽ đổi sang dùng các class animation *-out
  const [closing, setClosing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Đồng bộ cờ mount/closing nội bộ với prop `open` được điều khiển từ ngoài
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
      // Trễ một chút để animation CSS không xung đột với việc focus
      const id = setTimeout(() => searchRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    // open chuyển thành false → chạy animation thoát, nhưng chỉ khi đang được mount
    if (mounted) setClosing(true);
  }, [isOpen, mounted]);

  // Được gọi bởi onAnimationEnd của panel khi đang `closing` — unmount hoàn toàn + reset.
  // Phòng tránh sự kiện animationend nổi bọt từ animation của các mục con (entry so le).
  const handlePanelAnimationEnd = (e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (closing) {
      setMounted(false);
      setClosing(false);
      setSearch("");
      setActiveFilter(ALL_CATEGORIES);
    }
  };

  // Phím Esc đóng catalog (chỉ khi đang mở & chưa trong quá trình đóng)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !closing) {
        e.stopPropagation();
        onClose();
      }
    },
    [isOpen, closing, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  // Rẻ hiện tại (~107 entry) nhưng dễ chạy lại mỗi keystroke/re-render khi modal mở
  // — memoize để tránh tính lại filter khi search/activeFilter/catalog không đổi.
  // catalogVersion() làm dep để rebuild đúng khi catalog hydrate lại (hiếm khi đổi).
  const filtered = useMemo(
    () => filterCatalog(getCatalogEntries(), search, activeFilter),
    [search, activeFilter, catalogVersion()],
  );

  if (!mounted) return null;

  return (
    /* ── Lớp phủ toàn màn hình ── */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Decor Catalog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 16px 100px",
      }}
    >
      <div
        aria-hidden="true"
        onClick={closing ? undefined : onClose}
        className={closing ? "decor-backdrop-anim-out" : "decor-backdrop-anim"}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(253,249,240,0.40)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />

      {/* ── Bảng catalog ── */}
      <div
        ref={panelRef}
        className={closing ? "decor-panel-anim-out" : "decor-panel-anim"}
        onAnimationEnd={handlePanelAnimationEnd}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 896,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "rgba(241,238,229,0.92)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderRadius: 24,
          border: `1px solid ${alpha(RGB.primaryContainer, 0.30)}`,
          boxShadow: `0 16px 64px ${alpha(RGB.primary, 0.22)}`,
          overflow: "hidden",
        }}
      >
        {/* ── Phần đầu ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(230,226,217,0.5)",
          }}
        >
          <h2
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: 20,
              fontWeight: 700,
              lineHeight: "28px",
              color: T.primary,
              margin: 0,
            }}
          >
            Decor Catalog
          </h2>

          <button
            aria-label="Close catalog"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              background: "transparent",
              border: "none",
              borderRadius: 9999,
              cursor: "pointer",
              color: "#504532",
              transition: "background 0.18s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(230,226,217,0.6)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              close
            </span>
          </button>
        </div>

        {/* ── Tìm kiếm & Bộ lọc ── */}
        <div
          style={{
            padding: "16px 24px 8px",
            background: "rgba(253,249,240,0.35)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Tìm kiếm */}
          <div style={{ position: "relative" }}>
            <span
              className="material-symbols-outlined"
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 20,
                color: "#504532",
                pointerEvents: "none",
                lineHeight: 1,
              }}
            >
              search
            </span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search furniture..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search furniture"
              style={{
                width: "100%",
                paddingLeft: 44,
                paddingRight: 16,
                paddingTop: 11,
                paddingBottom: 11,
                borderRadius: 16,
                background: "#fdf9f0",
                border: "1px solid #d5c4ac",
                outline: "none",
                fontFamily: "'Nunito Sans', sans-serif",
                fontSize: 15,
                color: "#1c1c17",
                boxSizing: "border-box",
                transition: "border-color 0.18s, box-shadow 0.18s",
                boxShadow: `0 1px 3px ${alpha(RGB.primary, 0.06)}`,
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor = T.primaryContainer;
                (e.currentTarget as HTMLInputElement).style.boxShadow =
                  `0 0 0 2px ${alpha(RGB.primaryContainer, 0.25)}`;
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor = "#d5c4ac";
                (e.currentTarget as HTMLInputElement).style.boxShadow =
                  `0 1px 3px ${alpha(RGB.primary, 0.06)}`;
              }}
            />
          </div>

          <CategoryTabs
            chips={getFilterChips()}
            activeFilter={activeFilter}
            onSelect={setActiveFilter}
          />
        </div>

        {/* ── Lưới các mục ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px 24px",
          }}
        >
          <CatalogGrid items={filtered} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}
