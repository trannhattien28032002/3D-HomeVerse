/**
 * Design tokens màu sắc cho theme HomeVerse (warm gold palette).
 * Dùng inline style khi không thể dùng Tailwind class, ví dụ trong react-konva.
 * Các giá trị phải đồng bộ với tailwind.config.ts.
 */
export const T = {
    primary: "#7c5800",
    primaryContainer: "#f8b400",
    surface: "rgba(253,249,240,0.82)",
    onSurface: "#1c1c17",
    onSurfaceVariant: "#504532",
    outlineVariant: "rgba(213,196,172,0.5)",
    shadowGold: "rgba(124,88,0,0.18)",
} as const;
