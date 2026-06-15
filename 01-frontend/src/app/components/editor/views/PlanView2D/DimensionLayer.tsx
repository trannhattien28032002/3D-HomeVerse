/**
 * Lớp Konva vẽ chú thích kích thước trong Plan 2D.
 *
 * Hai loại annotation (cả 2 đều listening=false):
 *   1. Linear dimension — đường song song với tường, hiển thị chiều dài (m).
 *      - Extension lines từ endpoint ra ngoài DIM_OFFSET pixel.
 *      - Nhãn xoay theo góc tường, nền trắng để dễ đọc.
 *      - Ẩn khi stageScale < DIM_HIDE_BELOW hoặc chiều dài < MIN_DIM_LENGTH_M.
 *   2. Angle arc — cung tròn tại node nối nhiều tường, hiển thị góc (°).
 *      - Chỉ hiển thị khi stageScale >= ANGLE_HIDE_BELOW.
 *
 * ss() là hàm scale-stable: trả về pixel giữ nguyên kích thước thị giác khi zoom.
 */
import { memo } from "react";
import { Arc, Circle, Group, Layer, Line, Rect, Text } from "react-konva";
import type { Dimension2D, AngleDimension2D } from "src/app/plan2d/types";

const DIM_OFFSET       = Math.round(0.3 * 100);
const ANGLE_ARC_RADIUS = 28;
const DIM_HIDE_BELOW   = 0.25;
const ANGLE_HIDE_BELOW = 0.40;
const MIN_DIM_LENGTH_M = 0.25;

type Props = {
    dimensions: Dimension2D[];
    angleDimensions: AngleDimension2D[];
    stageScale: number;
    ss: (px: number) => number;
};

function DimensionLayerInner({ dimensions, angleDimensions, stageScale, ss }: Props) {
    return (
        <>
            {/* Linear dimension annotations */}
            <Layer listening={false}>
                {stageScale >= DIM_HIDE_BELOW && dimensions.filter(d => d.length >= MIN_DIM_LENGTH_M).map(dim => {
                    const ox = dim.perpX * DIM_OFFSET;
                    const oy = dim.perpY * DIM_OFFSET;
                    const x1 = dim.startX + ox, y1 = dim.startY + oy;
                    const x2 = dim.endX   + ox, y2 = dim.endY   + oy;
                    let angleDeg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
                    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
                    const mx    = (x1 + x2) / 2;
                    const my    = (y1 + y2) / 2;
                    const extG  = ss(5);
                    const extO  = ss(5);
                    const lblW  = Math.max(ss(54), dim.label.length * ss(7));
                    const lblH  = ss(14);
                    return (
                        <Group key={`dim-${dim.wallId}`}>
                            <Line points={[dim.startX + dim.perpX * extG, dim.startY + dim.perpY * extG, x1 + dim.perpX * extO, y1 + dim.perpY * extO]}
                                stroke="#a89880" strokeWidth={ss(0.8)} />
                            <Line points={[dim.endX + dim.perpX * extG, dim.endY + dim.perpY * extG, x2 + dim.perpX * extO, y2 + dim.perpY * extO]}
                                stroke="#a89880" strokeWidth={ss(0.8)} />
                            <Line points={[x1, y1, x2, y2]} stroke="#7c6a55" strokeWidth={ss(1)} />
                            <Circle x={x1} y={y1} radius={ss(2)} fill="#7c6a55" />
                            <Circle x={x2} y={y2} radius={ss(2)} fill="#7c6a55" />
                            <Rect x={mx} y={my} width={lblW} height={lblH} offsetX={lblW / 2} offsetY={lblH / 2}
                                rotation={angleDeg} fill="#f7f3ea" cornerRadius={ss(2)} />
                            <Text x={mx} y={my} text={dim.label} fontSize={ss(10)}
                                fontFamily="'Nunito Sans', sans-serif" fill="#504532"
                                width={lblW} height={lblH} align="center" verticalAlign="middle"
                                offsetX={lblW / 2} offsetY={lblH / 2} rotation={angleDeg} />
                        </Group>
                    );
                })}
            </Layer>

            {/* Angle arc annotations */}
            <Layer listening={false}>
                {stageScale >= ANGLE_HIDE_BELOW && angleDimensions.map((adim, i) => {
                    const arcR = ss(ANGLE_ARC_RADIUS);
                    const lx   = adim.cx + adim.bisectorX * (arcR + ss(14));
                    const ly   = adim.cy + adim.bisectorY * (arcR + ss(14));
                    const lw   = ss(36);
                    const lh   = ss(14);
                    return (
                        <Group key={`adim-${adim.nodeId}-${i}`}>
                            <Arc x={adim.cx} y={adim.cy}
                                innerRadius={0} outerRadius={arcR}
                                rotation={adim.startAngleDeg} angle={adim.sweepAngleDeg}
                                fill="rgba(100,149,237,0.12)" stroke="#6495ed" strokeWidth={ss(1)} />
                            <Text x={lx} y={ly} text={adim.label}
                                fontSize={ss(10)} fontFamily="'Nunito Sans', sans-serif" fill="#3a5aad"
                                width={lw} height={lh} align="center" verticalAlign="middle"
                                offsetX={lw / 2} offsetY={lh / 2} />
                        </Group>
                    );
                })}
            </Layer>
        </>
    );
}

/** DimensionLayer — React.memo'd để không re-render khi furniture drag (R2). */
export const DimensionLayer = memo(DimensionLayerInner);
