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
 * Bitmap cache (P2 — perf):
 *   Mỗi FurnitureNode tự `group.cache()` thành 1 bitmap → mỗi batchDraw chỉ blit
 *   ảnh thay vì rasterize lại Rect+Text. Re-cache khi hình đổi (size/rot/overlap/
 *   selected/label) hoặc khi mốc zoom đổi (cachePixelRatio). Bỏ cache trong lúc
 *   kéo món đó (vẽ live cho mượt), cache lại khi thả. Cắt phần lớn chi phí CPU khi
 *   scene có hàng trăm đồ trùng lặp.
 */
import { memo, useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { Group, Layer, Line, Rect, Text } from "react-konva";

import { T } from "src/app/constants/designTokens";
import { useFurnitureDrag } from "src/app/features/plan2d/hooks/useFurnitureDrag";
import type { PlanTransform } from "src/app/features/plan2d/PlanTransform";
import type { Furniture2D, Wall2D, Node2D } from "src/app/features/plan2d/types";
import type { WallSegment } from "src/shared/geometry/alignment";
import type { EngineCommand } from "src/engine/commands/EngineCommands";


type Props = {
    /** Toàn bộ furniture — dùng cho drag hook (collision/snap với mọi object). */
    furniture: Furniture2D[];
    /** Tập đã viewport-cull — chỉ tập này được render (Phase 2). */
    renderFurniture: Furniture2D[];
    /** LOD: vẽ nhãn modelId hay không (ẩn khi zoom xa hoặc khi quá nhiều đồ). */
    showLabels: boolean;
    /** P2: pixelRatio để cache bitmap đồ — quantize theo mốc zoom (xem index.tsx). */
    cachePixelRatio: number;
    isSelectMode: boolean;
    /** Tập object đang chọn (multi-select). Highlight = has(entityId). */
    selectedFurnitureIds: Set<string>;
    setSelectedFurnitureIds: Dispatch<SetStateAction<Set<string>>>;
    dragTransactionOpenRef: MutableRefObject<boolean>;
    /** Ghi inverse undo cho MOVE_FURNITURE (R3). */
    recordMoveUndo: (entityId: string, fromX: number, fromZ: number, toX: number, toZ: number) => void;
    /** Ghi inverse undo cho ROTATE_FURNITURE (R3). */
    recordRotateUndo: (entityId: string, fromRotY: number, toRotY: number) => void;
    /** Ghi inverse undo cho MOVE_WALL_ITEM (R3). */
    recordWallItemMoveUndo: (entityId: string, fromHostWallId: string, fromT: number, fromSide: number, toHostWallId: string, toT: number, toSide: number) => void;
    /** Check va chạm 3D với đồ khác (loại tường) ở Y thật — cho drag hook. */
    wouldFurnitureCollide: (entityId: string, worldX: number, worldZ: number) => boolean;
    /** Gói nhiều dispatch thành 1 entry undo — dùng cho group-move (multi-select). */
    withTransaction: (label: string, fn: () => void) => void;
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

/** Handler drag/transform/select bound theo từng món, truyền xuống FurnitureNode. */
type ItemHandlers = {
    onMouseDown: (f: Furniture2D, e: KonvaEventObject<MouseEvent>) => void;
    onDragStart: (f: Furniture2D) => void;
    onDragMove: (e: KonvaEventObject<MouseEvent>, f: Furniture2D) => void;
    onDragEnd: (e: KonvaEventObject<MouseEvent>, f: Furniture2D) => void;
    onTransformEnd: (e: KonvaEventObject<Event>, f: Furniture2D) => void;
};

/**
 * Thân vật thể 2D = hình chữ nhật theo đúng footprint va chạm 3D (f.width × f.depth,
 * đọc từ live ColliderAABB ở SnapshotSystem) + nhãn modelId canh giữa. Không dùng
 * ảnh PNG top-down nữa: kích thước hộp luôn khớp collision bên 3D (cửa, kệ tường, …).
 */
function renderBody(f: Furniture2D, ss: (px: number) => number, showLabel: boolean) {
    const fs     = ss(10);
    const labelW = Math.min(f.width * 0.9, ss(80));
    return (
        <>
            <Rect
                width={f.width} height={f.depth}
                offsetX={f.width / 2} offsetY={f.depth / 2}
                fill="rgba(160,133,106,0.30)" stroke={T.primary} strokeWidth={ss(1)}
            />
            {showLabel && (
                <Text
                    text={f.modelId} fontSize={fs}
                    fontFamily="'Nunito Sans', sans-serif" fill="#504532"
                    width={labelW} height={f.depth}
                    align="center" verticalAlign="middle"
                    offsetX={labelW / 2} offsetY={f.depth / 2}
                    wrap="none" ellipsis listening={false}
                />
            )}
        </>
    );
}

/**
 * FurnitureNode — một món đồ + tự quản lý bitmap cache (P2).
 *
 * Cache chạy trong useEffect (sau khi children commit) nên ảnh luôn phản ánh
 * hình hiện tại. Re-cache khi đổi hình hoặc đổi mốc zoom (cachePixelRatio). Trong
 * lúc kéo MÓN NÀY: clearCache để vẽ live (cache 1 node động vô ích + sai lúc xoay),
 * cache lại ngay khi thả.
 */
type FurnitureNodeProps = {
    f: Furniture2D;
    isSelected: boolean;
    isSelectMode: boolean;
    showLabel: boolean;
    cachePixelRatio: number;
    ss: (px: number) => number;
    handlers: ItemHandlers;
    registerNode: (entityId: string, node: Konva.Group | null) => void;
};

function FurnitureNode({ f, isSelected, isSelectMode, showLabel, cachePixelRatio, ss, handlers, registerNode }: FurnitureNodeProps) {
    const groupRef    = useRef<Konva.Group | null>(null);
    const draggingRef = useRef(false);

    const recache = useCallback((node: Konva.Group) => {
        node.clearCache();
        // pixelRatio bám mốc zoom → ảnh nét ở mức zoom hiện tại mà không re-cache mỗi tick.
        node.cache({ pixelRatio: cachePixelRatio });
        node.getLayer()?.batchDraw();
    }, [cachePixelRatio]);

    // Cache lại khi hình, nhãn, hoặc MỐC zoom đổi (recache đổi identity theo
    // cachePixelRatio). KHÔNG re-cache theo `ss`/scale liên tục: ss đổi mỗi lần
    // commit zoom → nếu để trong deps thì TOÀN BỘ đồ trong khung re-cache mỗi nấc
    // zoom (bão re-cache = lag). Độ dày stroke/cỡ chữ chỉ "bù scale" lại tại mốc
    // bậc — đúng ý đồ P2 (quantize theo mốc, không phải mỗi thay đổi scale).
    useEffect(() => {
        const node = groupRef.current;
        if (!node || draggingRef.current) return;
        recache(node);
    }, [recache, f.width, f.depth, f.overlapping, isSelected, showLabel]);

    return (
        <Group
            ref={(node: Konva.Group | null) => {
                groupRef.current = node;
                registerNode(f.entityId, node);
            }}
            x={f.x} y={f.y}
            rotation={f.rotDeg}
            draggable={isSelectMode}
            perfectDrawEnabled={false}
            onMouseDown={(e: KonvaEventObject<MouseEvent>) => handlers.onMouseDown(f, e)}
            onDragStart={() => {
                draggingRef.current = true;
                groupRef.current?.clearCache();
                handlers.onDragStart(f);
            }}
            onTransformEnd={(e: KonvaEventObject<Event>) => handlers.onTransformEnd(e, f)}
            onDragMove={(e: KonvaEventObject<MouseEvent>) => handlers.onDragMove(e, f)}
            onDragEnd={(e: KonvaEventObject<MouseEvent>) => {
                handlers.onDragEnd(e, f);
                draggingRef.current = false;
                // useEffect deps không đổi sau move (vị trí không nằm trong deps) → cache lại tay.
                if (groupRef.current) recache(groupRef.current);
            }}
        >
            {renderBody(f, ss, showLabel)}
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
                    stroke={T.primaryContainer} strokeWidth={ss(2)}
                    fill="transparent" listening={false}
                />
            )}
        </Group>
    );
}

function FurnitureLayerInner({
    furniture, renderFurniture, showLabels, cachePixelRatio, isSelectMode, selectedFurnitureIds, setSelectedFurnitureIds,
    dragTransactionOpenRef, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
    wouldFurnitureCollide, withTransaction,
    dispatch, transform, wallSegments,
    walls, nodeById, furnitureNodeRefs, ss,
}: Props) {
    // ── Drag logic (R7: moved to useFurnitureDrag hook) ──────────────────────
    const { onDragStart, onDragMove, onDragEnd, onTransformEnd, guideRef, collideRef } = useFurnitureDrag({
        furniture, transform, wallSegments, walls, nodeById,
        dragTransactionOpenRef,
        dispatch, recordMoveUndo, recordRotateUndo, recordWallItemMoveUndo,
        wouldFurnitureCollide,
        selectedFurnitureIds, furnitureNodeRefs, withTransaction,
    });

    // Ẩn ô báo va chạm khi layer unmount (collideRef sống ở Konva, không theo React tree).
    useEffect(() => () => { collideRef.current?.visible(false); }, [collideRef]);

    const registerNode = useCallback((entityId: string, node: Konva.Group | null) => {
        if (node) furnitureNodeRefs.current.set(entityId, node);
        else furnitureNodeRefs.current.delete(entityId);
    }, [furnitureNodeRefs]);

    // Chọn đồ: Shift+click → toggle multi-select; click thường → chọn đơn.
    // Ngoại lệ: click thường lên một vật ĐÃ thuộc nhóm (>1) → GIỮ NGUYÊN nhóm để cho
    // phép kéo cả cụm (nếu collapse về đơn thì group-move không bao giờ kích hoạt được).
    // Store tự cross-clear tường khi set object non-empty.
    const handleMouseDown = useCallback((f: Furniture2D, e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        if (e.evt.shiftKey) {
            setSelectedFurnitureIds(prev => {
                const next = new Set(prev);
                if (next.has(f.entityId)) next.delete(f.entityId);
                else next.add(f.entityId);
                return next;
            });
        } else if (selectedFurnitureIds.size > 1 && selectedFurnitureIds.has(f.entityId)) {
            // giữ nguyên nhóm — không collapse
        } else {
            setSelectedFurnitureIds(new Set([f.entityId]));
        }
    }, [setSelectedFurnitureIds, selectedFurnitureIds]);

    // Gom handler bound — reference ổn định để FurnitureNode không re-render thừa.
    const handlers: ItemHandlers = {
        onMouseDown: handleMouseDown,
        onDragStart, onDragMove, onDragEnd, onTransformEnd,
    };

    return (
        <Layer listening={isSelectMode}>
            {renderFurniture.map(f => (
                <FurnitureNode
                    key={`furn-${f.entityId}`}
                    f={f}
                    isSelected={selectedFurnitureIds.has(f.entityId)}
                    isSelectMode={isSelectMode}
                    showLabel={showLabels}
                    cachePixelRatio={cachePixelRatio}
                    ss={ss}
                    handlers={handlers}
                    registerNode={registerNode}
                />
            ))}
            {/* Đường gióng wall-snap — điều khiển imperative qua guideRef khi kéo. */}
            <Line ref={guideRef} stroke={T.primaryContainer} strokeWidth={ss(2)} dash={[ss(8), ss(5)]} listening={false} visible={false} perfectDrawEnabled={false} />
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
