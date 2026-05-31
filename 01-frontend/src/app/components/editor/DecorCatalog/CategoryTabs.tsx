import { labelize, ALL_CATEGORIES } from "./catalogData";

type Props = {
  chips: string[];
  activeFilter: string;
  onSelect: (chip: string) => void;
};

export function CategoryTabs({ chips, activeFilter, onSelect }: Props) {
  return (
    <div
      className="hide-scrollbar"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        paddingBottom: 4,
      }}
    >
      {chips.map((chip) => {
        const isActive = activeFilter === chip;
        return (
          <button
            key={chip}
            onClick={() => onSelect(chip)}
            style={{
              padding: "7px 18px",
              borderRadius: 9999,
              background: isActive ? "#f8b400" : "#fdf9f0",
              color: isActive ? "#674900" : "#504532",
              border: isActive
                ? "1px solid transparent"
                : "1px solid #d5c4ac",
              fontFamily: "'Nunito Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isActive
                ? "0 0 12px rgba(248,180,0,0.30)"
                : "none",
              transition: "all 0.18s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(248,180,0,0.18)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#f8b400";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "#fdf9f0";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#d5c4ac";
              }
            }}
          >
            {chip === ALL_CATEGORIES ? chip : labelize(chip)}
          </button>
        );
      })}
    </div>
  );
}
