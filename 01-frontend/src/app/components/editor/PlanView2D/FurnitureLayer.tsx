import { useEffect, useState } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { Group, Layer, Rect, Text } from "react-konva";

import { ensureImage, getLoadedImage, subscribeImages } from "src/app/components/editor/furnitureImages";
import { TopDownSprite } from "src/app/components/editor/furnitureSprite";
import { konvaDegToThreeRotY } from "src/shared/math/coords";
import { snapToGridM } from "src/shared/constants/placement";
import type { Furniture2D } from "src/app/store/useFloorPlanSnapshot";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

const PX_PER_WORLD = 100;

type Props = {
    furniture: Furniture2D[];
    isSelectMode: boolean;
    selectedFurnitureId: number | null;
    setSelectedFurnitureId: (id: number | null) => void;
    setSelectedWallIds: Dispatch<SetStateAction<Set<number>>>;
    dragTransactionOpenRef: MutableRefObject<boolean>;
    beginTransaction: (label: string) => void;
    commitTransaction: () => void;
    withTransaction: (label: string, fn: () => void) => void;
    dispatch: (cmd: EngineCommand) => void;
    originX: number;
    originY: number;
    furnitureNodeRefs: MutableRefObject<Map<number, Konva.Group>>;
    ss: (px: number) => number;
};

function renderBody(f: Furniture2D, ss: (px: number) => number) {
    const img = f.topDownUrl ? getLoadedImage(f.topDownUrl) : null;
    if (img) {
        return <TopDownSprite image={img} url={f.topDownUrl} width={f.width} depth={f.depth} />;
    }
    const fs     = ss(10);
    const labelW = Math.min(f.width * 0.9, ss(80));
    return (
        <>
            <Rect
                width={f.width} height={f.depth}
                offsetX={f.width / 2} offsetY={f.depth / 2}
                fill="rgba(160,133,106,0.30)" stroke="#7c5800" strokeWidth={ss(1)}
            />
            <Text
                text={f.modelId} fontSize={fs}
                fontFamily="'Nunito Sans', sans-serif" fill="#504532"
                width={labelW} height={f.depth}
                align="center" verticalAlign="middle"
                offsetX={labelW / 2} offsetY={f.depth / 2}
                wrap="none" ellipsis
            />
        </>
    );
}

export function FurnitureLayer({
    furniture, isSelectMode, selectedFurnitureId, setSelectedFurnitureId,
    setSelectedWallIds, dragTransactionOpenRef, beginTransaction, commitTransaction,
    withTransaction, dispatch, originX, originY, furnitureNodeRefs, ss,
}: Props) {
    const [, setImageVersion] = useState(0);
    useEffect(() => subscribeImages(() => setImageVersion(v => v + 1)), []);
    for (const f of furniture) {
        if (f.topDownUrl) ensureImage(f.topDownUrl);
    }

    return (
        <Layer listening={isSelectMode}>
            {furniture.map(f => {
                const isSelected = f.entityId === selectedFurnitureId;
                return (
                    <Group
                        key={`furn-${f.entityId}`}
                        ref={(node: Konva.Group | null) => {
                            if (node) furnitureNodeRefs.current.set(f.entityId, node);
                            else furnitureNodeRefs.current.delete(f.entityId);
                        }}
                        x={f.x} y={f.y}
                        rotation={f.rotDeg}
                        draggable={isSelectMode}
                        perfectDrawEnabled={false}
                        onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
                            e.cancelBubble = true;
                            setSelectedFurnitureId(f.entityId);
                            setSelectedWallIds(new Set());
                        }}
                        onDragStart={() => {
                            dragTransactionOpenRef.current = true;
                            beginTransaction("move furniture");
                        }}
                        onTransformEnd={(e: KonvaEventObject<Event>) => {
                            const node = e.target;
                            // Transformer never resizes — clear any scale drift.
                            node.scaleX(1);
                            node.scaleY(1);
                            const rotY = konvaDegToThreeRotY(node.rotation());
                            withTransaction("rotate furniture", () => {
                                dispatch({ type: "ROTATE_FURNITURE", entityId: f.entityId, rotY });
                            });
                        }}
                        onDragMove={(e: KonvaEventObject<MouseEvent>) => {
                            // Snap imperatively during drag — no ECS dispatch to avoid
                            // snapshot-driven re-renders interrupting Konva's drag gesture.
                            const node = e.target;
                            const pos  = node.position();
                            const worldX = snapToGridM((pos.x - originX) / PX_PER_WORLD);
                            const worldZ = snapToGridM((pos.y - originY) / PX_PER_WORLD);
                            node.position({ x: worldX * PX_PER_WORLD + originX, y: worldZ * PX_PER_WORLD + originY });
                        }}
                        onDragEnd={(e: KonvaEventObject<MouseEvent>) => {
                            dragTransactionOpenRef.current = false;
                            const node = e.target;
                            const pos  = node.position();
                            const worldX = snapToGridM((pos.x - originX) / PX_PER_WORLD);
                            const worldZ = snapToGridM((pos.y - originY) / PX_PER_WORLD);
                            dispatch({ type: "MOVE_FURNITURE", entityId: f.entityId, x: worldX, z: worldZ });
                            commitTransaction();
                        }}
                    >
                        {renderBody(f, ss)}
                        {isSelected && (
                            <Rect
                                width={f.width} height={f.depth}
                                offsetX={f.width / 2} offsetY={f.depth / 2}
                                stroke="#f8b400" strokeWidth={ss(2)}
                                fill="transparent" listening={false}
                            />
                        )}
                    </Group>
                );
            })}
        </Layer>
    );
}
