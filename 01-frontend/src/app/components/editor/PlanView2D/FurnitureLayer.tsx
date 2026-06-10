/**
 * Lớp Konva vẽ và xử lý drag/rotate đồ vật trong Plan 2D.
 *
 * Mỗi furniture được render như một Konva.Group có thể drag.
 * renderBody() chọn giữa TopDownSprite (ảnh top-down) hoặc placeholder rect+text.
 *
 * Sau R7: component này chỉ chứa render logic. Toàn bộ drag/collision/snap/undo
 * đã được tách sang `useFurnitureDrag` hook — có thể unit-test độc lập.
 *
 * Snap khi drag:
 *   - onDragMove: snap imperative vào lưới (snapToGridM) trực tiếp trên node Konva
 *     để tránh ECS dispatch → snapshot → re-render làm gián đoạn gesture.
 *   - onDragEnd: dispatch MOVE_FURNITURE với tọa độ world đã snap.
 *
 * Undo (R3 — command-inverse):
 *   Khi drag kết thúc, gọi recordMoveUndo / recordRotateUndo / recordWallItemMoveUndo
 *   thay vì snapshot toàn scene. Undo = dispatch inverse command, không teardown mesh.
 *
 * Image subscription:
 *   subscribeImages() → setImageVersion khi ảnh load xong, buộc re-render để
 *   thay placeholder bằng sprite thật.
 */
import { memo, useEffect, useState } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { Group, Layer, Line, Rect, Text } from "react-konva";

import { ensureImage, getLoadedImage, subscribeImages } from "src/app/components/editor/furnitureImages";
import { TopDownSprite } from "src/app/components/editor/furnitureSprite";
import { useFurnitureDrag } from "./useFurnitureDrag";
import type { PlanTransform } from "src/app/plan2d/PlanTransform";
import type { Furniture2D, Wall2D, Node2D } from "src/app/plan2d/types";
import type { WallSegment } from "src/shared/geometry/alignment";
import type { EngineCommand } from "src/engine/commands/EngineCommands";


type Props = {
    furniture: Furniture2D[];
    isSelectMode: boolean;
    selectedFurnitureId: string | null;
    setSelectedFurnitureId: (id: string | null) => void;
    setSelectedWallIds: Dispatch<SetStateAction<Set<string>>>;
    dragTransactionOpenRef: MutableRefObject<boolean>;
    /** Ghi inverse undo cho MOVE_FURNITURE (R3). */
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    /** Ghi inverse undo cho ROTATE_FURNITURE (R3). */
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    /** Ghi inverse undo cho MOVE_WALL_ITEM (R3). */
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
    dispatch: (cmd: EngineCommand) => void;
    transform: PlanTransform;
    /** Tường (world-space mét) để wall-snap khi kéo. */
    wallSegments: WallSegment[];
    /** Tường px-space + nodeById để chiếu wall-item (cửa) lên tim tường khi kéo. */
    walls: Wall2D[];
    nodeById: Map<string, Node2D>;
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
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

function FurnitureLayerInner({
    furniture, isSelectMode, selectedFurnitureId, setSelectedFurnitureId,
    setSelectedWallIds, dragTransactionOpenRef, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
    dispatch, transform, wallSegments,
    walls, nodeById, furnitureNodeRefs, ss,
}: Props) {
    const [, setImageVersion] = useState(0);
    useEffect(() => subscribeImages(() => setImageVersion(v => v + 1)), []);
    useEffect(() => () => { collideRef.current?.visible(false); }, []);
    for (const f of furniture) {
        if (f.topDownUrl) ensureImage(f.topDownUrl);
    }

    // ── Drag logic (R7: moved to useFurnitureDrag hook) ──────────────────────
    const { onDragStart, onDragMove, onDragEnd, onTransformEnd, guideRef, collideRef } = useFurnitureDrag({
        furniture, transform, wallSegments, walls, nodeById,
        dragTransactionOpenRef, setSelectedWallIds,
        dispatch, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
    });

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
                        onDragStart={() => onDragStart(f)}
                        onTransformEnd={(e: KonvaEventObject<Event>) => onTransformEnd(e, f)}
                        onDragMove={(e: KonvaEventObject<MouseEvent>) => onDragMove(e, f)}
                        onDragEnd={(e: KonvaEventObject<MouseEvent>) => onDragEnd(e, f)}
                    >
                        {renderBody(f, ss)}
                        {f.isWallItem && f.overlapping && (
                            // Cảnh báo đỏ: wall-item chồng chỗ với item khác sau resize/merge.
                            <Rect
                                width={f.width} height={f.depth}
                                offsetX={f.width / 2} offsetY={f.depth / 2}
                                stroke="#c81e1e" strokeWidth={ss(2)} dash={[ss(5), ss(4)]}
                                fill="rgba(200,30,30,0.25)" listening={false} perfectDrawEnabled={false}
                            />
                        )}
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
            {/* Đường gióng wall-snap — điều khiển imperative qua guideRef khi kéo. */}
            <Line ref={guideRef} stroke="#f8b400" strokeWidth={ss(2)} dash={[ss(8), ss(5)]} listening={false} visible={false} perfectDrawEnabled={false} />
            {/* Ô đỏ báo chồng lấn khi kéo cửa — điều khiển imperative qua collideRef. */}
            <Rect ref={collideRef} fill="rgba(200,30,30,0.35)" stroke="#c81e1e" strokeWidth={ss(1.5)} dash={[ss(5), ss(4)]} listening={false} visible={false} perfectDrawEnabled={false} />
        </Layer>
    );
}

/**
 * FurnitureLayer — React.memo'd để tận dụng per-collection memo trong useFloorPlanSnapshot (R2).
 * Khi drag node và wall không đổi: WallLayer/RoomLayer không re-render, chỉ FurnitureLayer render.
 * Sau khi thả (onDragEnd dispatch MOVE_FURNITURE → snapshot → setSnap): tất cả layer re-render
 * nhưng chỉ furniture collection đổi nên WallLayer/RoomLayer/DimensionLayer vẫn bail out nhờ memo.
 */
export const FurnitureLayer = memo(FurnitureLayerInner);
