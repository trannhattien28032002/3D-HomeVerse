import { Layer, Line } from "react-konva";
import type { Wall2D, Cap2D } from "src/app/store/useFloorPlanSnapshot";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { ToolId } from "src/app/components/editor/tools/toolRegistry";

type Props = {
    walls: Wall2D[];
    caps: Cap2D[];
    activeTool: ToolBase;
    activeTool2D: ToolId;
};

export function WallLayer({ walls, caps, activeTool, activeTool2D }: Props) {
    return (
        <>
            {/* Outlines — no interaction, always visible */}
            <Layer listening={false}>
                {caps.map(cap => (
                    <Line key={`cap-outline-${cap.nodeId}`} points={cap.polygon.flatMap(p => [p.x, p.y])} closed
                        stroke="#504532" strokeWidth={3} lineJoin="round" />
                ))}
                {walls.map(wall => wall.polygon
                    ? <Line key={`outline-${wall.id}`} points={wall.polygon.flatMap(p => [p.x, p.y])} closed stroke="#504532" strokeWidth={3} lineJoin="round" />
                    : <Line key={`outline-${wall.id}`} points={[wall.cx, wall.cy, wall.cx, wall.cy]} stroke="#504532" strokeWidth={3} />
                )}
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
