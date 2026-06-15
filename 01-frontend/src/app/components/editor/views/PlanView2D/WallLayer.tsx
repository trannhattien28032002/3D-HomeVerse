/**
 * Lớp Konva vẽ tường, cap, và ký hiệu cửa/cửa sổ kiến trúc trong Plan 2D.
 *
 * Chia thành 2 Layer tách biệt:
 *   1. Outline layer (listening=false) — viền ngoài tường + ký hiệu cửa.
 *   2. Fill layer (listening chỉ khi tool="select") — tô màu + delegate event chuột.
 *
 * Ký hiệu cửa chuẩn kiến trúc (chỉ cho wallBehavior="opening"):
 *   - Rect trắng khoét lỗ trên tường tại vị trí cutWidth.
 *   - Line (cánh cửa đóng) + Arc (swing, 90°) bên phía wallSide.
 */
import { memo } from "react";
import { Arc, Layer, Line, Rect } from "react-konva";
import type { Wall2D, Cap2D, Furniture2D, Node2D } from "src/app/plan2d/types";
import { PX_PER_WORLD } from "src/shared/math/coords";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { ToolId } from "src/app/components/editor/tools/toolRegistry";

type Props = {
    walls: Wall2D[];
    caps: Cap2D[];
    furniture: Furniture2D[];
    activeTool: ToolBase;
    activeTool2D: ToolId;
    nodeById: Map<string, Node2D>;
    /**
     * Chỉ để bust React.memo khi selection đổi — màu fill được tính trong
     * activeTool.getWallProps() (đọc ctx.selectedWallIds), không đọc trực tiếp ở đây.
     * activeTool là reference ổn định nên nếu thiếu prop này, Ctrl+A / click đổi
     * selectedWallIds sẽ không re-render fill (vàng không sáng). Set là new ref mỗi
     * lần đổi selection → memo render lại; drag furniture giữ nguyên ref → vẫn freeze (R2).
     */
    selectedWallIds: Set<string>;
};

/**
 * Tính điểm tâm tim tường tại t, hướng unit, và pháp tuyến unit.
 * Trả về null nếu thiếu node hoặc tường quá ngắn.
 */
function wallBasis2D(
    wall: Wall2D,
    t: number,
    nodeById: Map<string, Node2D>,
): { px: number; py: number; ux: number; uy: number; nx: number; ny: number; len: number } | null {
    const a = nodeById.get(wall.startNodeId);
    const b = nodeById.get(wall.endNodeId);
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len;
    const uy = dy / len;
    return {
        px: a.x + dx * t,
        py: a.y + dy * t,
        ux, uy,
        nx: -uy, ny: ux, // pháp tuyến (rot 90° CCW)
        len,
    };
}

// selectedWallIds KHÔNG destructure ở đây: React.memo so sánh props object do parent
// truyền (xem JSDoc của Props.selectedWallIds), không phụ thuộc việc destructure trong thân.
function WallLayerInner({ walls, caps, furniture, activeTool, activeTool2D, nodeById }: Props) {
    // Gom danh sách opening items theo hostWallId để tra cứu nhanh.
    const openingsByWall = new Map<string, Furniture2D[]>();
    for (const f of furniture) {
        if (f.isWallItem && f.wallBehavior === "opening" && f.hostWallId && f.wallT !== undefined && f.cutWidthPx !== undefined) {
            const arr = openingsByWall.get(f.hostWallId) ?? [];
            arr.push(f);
            openingsByWall.set(f.hostWallId, arr);
        }
    }

    return (
        <>
            {/* Outlines + ký hiệu cửa — no interaction, always visible */}
            <Layer listening={false}>
                {caps.map(cap => (
                    <Line key={`cap-outline-${cap.nodeId}`} points={cap.polygon.flatMap(p => [p.x, p.y])} closed
                        stroke="#504532" strokeWidth={3} lineJoin="round" />
                ))}
                {walls.map(wall => wall.polygon
                    ? <Line key={`outline-${wall.id}`} points={wall.polygon.flatMap(p => [p.x, p.y])} closed stroke="#504532" strokeWidth={3} lineJoin="round" />
                    : <Line key={`outline-${wall.id}`} points={[wall.cx, wall.cy, wall.cx, wall.cy]} stroke="#504532" strokeWidth={3} />
                )}
                {/* Ký hiệu cửa kiến trúc */}
                {walls.flatMap(wall => {
                    const openings = openingsByWall.get(wall.id);
                    if (!openings || openings.length === 0) return [];
                    return openings.flatMap(f => {
                        if (f.wallT === undefined || f.cutWidthPx === undefined) return [];
                        const basis = wallBasis2D(wall, f.wallT, nodeById);
                        if (!basis) return [];
                        const { px, py, ux, uy, nx, ny } = basis;
                        const hw = f.cutWidthPx / 2; // nửa bề rộng lỗ (px)
                        const side = f.wallSide ?? 1;
                        const wallThickPx = wall.thickness * PX_PER_WORLD; // thickness mét → px

                        // Điểm A, B = 2 mép lỗ dọc tim tường.
                        const ax = px - ux * hw;
                        const ay = py - uy * hw;
                        const bx = px + ux * hw;
                        const by = py + uy * hw;

                        // Hướng swing: nhìn từ B theo chiều side*normal (vuông góc ra ngoài).
                        // Cánh cửa = Line A→B (song song tường = đóng).
                        // Arc từ B, bán kính = cutWidthPx, quét 90° về phía side*normal.
                        const arcAngleDeg = Math.atan2(uy, ux) * (180 / Math.PI);
                        const arcRotDeg = side >= 0 ? arcAngleDeg + 180 : arcAngleDeg;

                        return [
                            // Khoét trắng che outline tường (approximation — rect trên tim tường).
                            <Rect
                                key={`opening-mask-${f.entityId}`}
                                x={px}
                                y={py}
                                width={f.cutWidthPx}
                                height={wallThickPx}
                                offsetX={hw}
                                offsetY={wallThickPx / 2}
                                rotation={Math.atan2(uy, ux) * (180 / Math.PI)}
                                fill="#f7f3ea"
                                listening={false}
                            />,
                            // Cánh cửa (line A→B).
                            <Line
                                key={`door-leaf-${f.entityId}`}
                                points={[ax, ay, bx, by]}
                                stroke="#504532"
                                strokeWidth={2}
                                listening={false}
                            />,
                            // Swing arc từ B, bán kính = hw*2, 90°.
                            <Arc
                                key={`door-arc-${f.entityId}`}
                                x={side >= 0 ? bx : ax}
                                y={side >= 0 ? by : ay}
                                innerRadius={0}
                                outerRadius={f.cutWidthPx}
                                angle={90}
                                rotation={arcRotDeg}
                                fill="transparent"
                                stroke="#504532"
                                strokeWidth={1.5}
                                dash={[6, 4]}
                                listening={false}
                            />,
                            // Pháp tuyến đầu arc (hướng cánh cửa mở — nét đứt mảnh).
                            <Line
                                key={`door-normal-${f.entityId}`}
                                points={[
                                    side >= 0 ? bx : ax,
                                    side >= 0 ? by : ay,
                                    (side >= 0 ? bx : ax) + nx * side * f.cutWidthPx,
                                    (side >= 0 ? by : ay) + ny * side * f.cutWidthPx,
                                ]}
                                stroke="#504532"
                                strokeWidth={2}
                                listening={false}
                            />,
                        ];
                    });
                })}
            </Layer>

            {/* Fills + tool-delegated handlers */}
            <Layer listening={activeTool2D === "select"}>
                {caps.map(cap => (
                    <Line key={`cap-fill-${cap.nodeId}`} points={cap.polygon.flatMap(p => [p.x, p.y])} closed
                        fill="#d5c4ac" stroke="#d5c4ac" strokeWidth={1} lineJoin="miter" listening={false} />
                ))}
                {walls.map(wall => {
                    if (!wall.polygon) return null;
                    const { fill, stroke, draggable, ...handlers } = activeTool.getWallProps(wall);
                    return (
                        <Line
                            key={`fill-${wall.id}`}
                            points={wall.polygon.flatMap(p => [p.x, p.y])}
                            closed
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={1}
                            lineJoin="miter"
                            draggable={draggable}
                            {...handlers}
                        />
                    );
                })}
            </Layer>
        </>
    );
}

/**
 * WallLayer — React.memo'd để không re-render khi chỉ furniture thay đổi (R2).
 * activeTool là object reference — thay đổi mỗi render nên không làm memo tốt hơn
 * cho prop này, nhưng walls/caps/furniture/nodeById là stable khi drag chỉ đổi furniture.
 */
export const WallLayer = memo(WallLayerInner);
