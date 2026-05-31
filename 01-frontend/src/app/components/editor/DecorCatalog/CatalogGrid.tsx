import type { CatalogEntry } from "./catalogData";
import { CatalogItem } from "./CatalogItem";

type Props = {
  items: CatalogEntry[];
  onSelect: (id: string) => void;
};

export function CatalogGrid({ items, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "40px 0",
          color: "#837560",
          fontFamily: "'Nunito Sans', sans-serif",
          fontSize: 14,
        }}
      >
        No items match your search.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: 14,
      }}
    >
      {items.map((obj, i) => (
        <CatalogItem
          key={obj.id}
          thumbnailUrl={obj.thumbnailUrl}
          name={obj.name}
          index={i}
          onClick={() => onSelect(obj.id)}
        />
      ))}
    </div>
  );
}
