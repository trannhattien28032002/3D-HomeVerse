/**
 * Lớp Konva vẽ polygon phòng (room fill) và nhãn diện tích trong Plan 2D.
 *
 * Chia 2 Layer:
 *   1. Fill layer (listening khi tool="select") — vùng phòng màu vàng nhạt,
 *      click để bỏ chọn tường (cancelBubble = true ngăn Stage nhận event).
 *   2. Label layer (listening=false) — hiển thị diện tích (m²) tại centroid,
 *      chỉ render khi stageScale >= DIM_HIDE_BELOW để tránh lộn xộn khi zoom out.
 */
import { memo } from "react";
import { Group, Layer, Line, Rect, Text } from "react-konva";
import type { Room2D } from "src/app/store/useFloorPlanSnapshot";
import type { ToolId } from "src/app/components/editor/tools/toolRegistry";

type Props = {
    rooms: Room2D[];
    stageScale: number;
    activeTool2D: ToolId;
    /** Chọn phòng (theo roomKey bền) — nguồn cho Material Sidebar đổi material sàn. */
    onSelectRoom: (roomKey: string) => void;
    ss: (px: number) => number;
};

const DIM_HIDE_BELOW = 0.25;

function RoomLayerInner({ rooms, stageScale, activeTool2D, onSelectRoom, ss }: Props) {
    return (
        <>
            {/* Room fills — click chọn phòng (để đổi material sàn) */}
            <Layer listening={activeTool2D === "select"}>
                {rooms.map(room => (
                    <Line key={room.id} points={room.polygon.flatMap(p => [p.x, p.y])} closed
                        fill="rgba(248,180,0,0.10)" stroke="rgba(124,88,0,0.18)" strokeWidth={2} lineJoin="round"
                        onClick={e => { e.cancelBubble = true; onSelectRoom(room.key); }}
                    />
                ))}
            </Layer>

            {/* Room area labels */}
            <Layer listening={false}>
                {stageScale >= DIM_HIDE_BELOW && rooms.map(room => {
                    const fs   = ss(11);
                    const pw   = ss(4);
                    const sw   = ss(0.5);
                    const cr   = ss(3);
                    const lblW = room.label.length * fs * 0.62 + pw * 2;
                    const lblH = fs * 1.4 + pw;
                    return (
                        <Group key={`area-${room.id}`}>
                            <Rect
                                x={room.centroidX} y={room.centroidY}
                                width={lblW} height={lblH}
                                offsetX={lblW / 2} offsetY={lblH / 2}
                                fill="rgba(253,249,240,0.88)"
                                stroke="rgba(124,88,0,0.22)" strokeWidth={sw}
                                cornerRadius={cr}
                            />
                            <Text
                                x={room.centroidX} y={room.centroidY}
                                text={room.label}
                                fontSize={fs}
                                fontFamily="'Nunito Sans', sans-serif"
                                fontStyle="bold"
                                fill="#7c5800"
                                width={lblW} height={lblH}
                                align="center" verticalAlign="middle"
                                offsetX={lblW / 2} offsetY={lblH / 2}
                            />
                        </Group>
                    );
                })}
            </Layer>
        </>
    );
}

/** RoomLayer — React.memo'd để không re-render khi furniture drag (R2). */
export const RoomLayer = memo(RoomLayerInner);
