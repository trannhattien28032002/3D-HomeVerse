import { Arrow, Circle, Layer, Text } from "react-konva";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";

type Props = {
    activeTool: ToolBase;
    transform: PlanTransform;
};

export function OverlayLayer({ activeTool, transform }: Props) {
    const { originX, originY } = transform;
    return (
        <>
            {activeTool.renderOverlay()}

            {/* Axes XZ — always on top */}
            <Layer listening={false}>
                <Arrow points={[originX, originY, originX + 60, originY]} pointerLength={10} pointerWidth={8} fill="#ba1a1a" stroke="#ba1a1a" strokeWidth={2} />
                <Text x={originX + 64} y={originY - 7} text="X" fill="#ba1a1a" fontSize={13} fontStyle="bold" />
                <Arrow points={[originX, originY, originX, originY + 60]} pointerLength={10} pointerWidth={8} fill="#496640" stroke="#496640" strokeWidth={2} />
                <Text x={originX + 6} y={originY + 64} text="Z" fill="#496640" fontSize={13} fontStyle="bold" />
                <Circle x={originX} y={originY} radius={4} fill="#837560" />
                <Text x={originX + 6} y={originY - 16} text="O" fill="#837560" fontSize={11} />
            </Layer>
        </>
    );
}
