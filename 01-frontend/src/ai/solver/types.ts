/**
 * solver/types — kiểu dữ liệu cho layout solver (WP4).
 *
 * Tất cả thuần hình học XZ (mét). Solver KHÔNG chạm ECS/dispatch — nhận room
 * geometry + footprint getter, trả toạ độ. Xem AI-AGENT-BUILD-PLAN §WP4.
 *
 * Calibrate (TD-5, chốt từ dữ liệu scene mẫu — generator dùng rotY=deg·π/180):
 *   forward(rotY) = (sin rotY, cos rotY) trong (x,z).
 *     rotY 0   → +Z   (mặt trước quay về +Z)
 *     rotY π/2 → +X
 *     rotY π   → −Z
 *     rotY 3π/2→ −X
 *   Convention tường: north=minZ, south=maxZ, west=minX, east=maxX.
 *   "Áp tường bắc, quay vào phòng" = gần minZ, mặt +Z → rotY 0.
 */

export type Anchor =
    | "north-wall"
    | "south-wall"
    | "east-wall"
    | "west-wall"
    | "center"
    | "corner-nw"
    | "corner-ne"
    | "corner-sw"
    | "corner-se";

export type Rect = { minX: number; minZ: number; maxX: number; maxZ: number };

/** Footprint full-size (mét) — từ getFootprint2D(modelId). */
export type Footprint = { width: number; depth: number };
export type FootprintGetter = (modelId: string) => Footprint;

/** Hình học phòng lấy từ describeScene().rooms[i] — KHÔNG query lại engine. */
export type SolverRoom = {
    /** RoomSummary.bbox. */
    bbox: Rect;
    /** Đỉnh perimeter theo thứ tự (RoomDetection.points). */
    points: { x: number; z: number }[];
    /** RoomSummary.centroid. */
    centroid: { x: number; z: number };
    /** Bề dày tường bao lớn nhất (từ WallSummary.thickness). */
    wallThickness: number;
};

export type Obstacle = {
    rect: Rect;
    /** "underlay" = thảm (nằm DƯỚI đồ thường); va chạm chỉ tính trong cùng lớp. */
    kind: "furniture" | "opening-clearance" | "underlay";
};

/** Ý định bố cục do LLM quyết; solver dịch sang toạ độ. */
export type PlacementIntent = {
    modelId: string;
    against?: Anchor;
    /** Lối đi tối thiểu quanh món (m). Mặc định 0.6. */
    clearance?: number;
    /** "into-room" (mặc định khi áp tường) | "to-wall" | số = rotY radian minh thị. */
    facing?: "into-room" | "to-wall" | number;
    /** Vị trí dọc tường 0..1 (mặc định 0.5 = giữa cạnh). */
    align?: number;
    /**
     * Neo TƯƠNG ĐỐI theo một món KHÁC đã đặt cùng lượt (B1/B2). Giá trị = modelId
     * món tham chiếu (vd sofa cho bàn trà, table cho ghế). Solver đặt món ref TRƯỚC
     * rồi xếp món này quanh nó. Nếu ref chưa/không đặt được → skip.
     */
    anchorTo?: string;
    /** Cách đặt quanh ref: "front" (ngay trước mặt ref) | "around" (vây 4 cạnh ref). */
    relation?: "front" | "around";
    /**
     * Lớp đặt. "underlay" = thảm nằm DƯỚI đồ thường → solver BỎ va chạm chéo lớp
     * (thảm ↔ đồ/cửa) nhưng vẫn phải trong phòng + không chồng thảm khác (B3).
     */
    layer?: "underlay";
};

export type Placement = {
    modelId: string;
    x: number;
    z: number;
    rotY: number;
    /** "underlay" = thảm (đặt dưới đồ) — eval bỏ qua chồng/lối với nó. */
    layer?: "underlay";
};

export type LayoutResult = {
    placed: Placement[];
    /** Món không đặt được — trả về agent để tự xử (bỏ/hỏi). */
    skipped: { modelId: string; reason: string }[];
};
