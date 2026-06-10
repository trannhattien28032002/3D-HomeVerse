/**
 * Lớp Konva vẽ và xử lý drag/rotate đồ vật trong Plan 2D.
 *
 * Mỗi furniture được render như một Konva.Group có thể drag.
 * renderBody() chọn giữa TopDownSprite (ảnh top-down) hoặc placeholder rect+text.
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
import { memo, useEffect, useRef, useState } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { Group, Layer, Line, Rect, Text } from "react-konva";

import { ensureImage, getLoadedImage, subscribeImages } from "src/app/components/editor/furnitureImages";
import { TopDownSprite } from "src/app/components/editor/furnitureSprite";
import { PX_PER_WORLD, konvaDegToThreeRotY, threeRotYToKonvaDeg } from "src/shared/math/coords";
import { snapAngleRad } from "src/shared/constants/placement";
import { resolveAlignment, type WallSegment, type FurnitureBox } from "src/shared/geometry/alignment";
import { obbCorners, collidesWithWalls, collidesWithFurniture } from "src/app/components/editor/tools/collision2D";
import { buildFurnitureBoxes2D } from "./wallSegments2D";
import { projectToNearestWall, buildOpeningOccupancy } from "./wallItemDrag2D";
import { buildOccupiedRanges, occupiedOverlaps } from "src/engine/utils/wallOccupancy";
import { occupancyLane } from "src/shared/geometry/wallMount";
import { resolveWallItemDims } from "src/engine/catalog/wallItem";
import type { Furniture2D, Wall2D, Node2D } from "src/app/store/useFloorPlanSnapshot";
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
    originX: number;
    originY: number;
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
    dispatch, originX, originY, wallSegments,
    walls, nodeById, furnitureNodeRefs, ss,
}: Props) {
    const [, setImageVersion] = useState(0);
    useEffect(() => subscribeImages(() => setImageVersion(v => v + 1)), []);
    // Đảm bảo ô đỏ ẩn khi layer unmount (tránh kẹt nếu drag bị gián đoạn ngoài onDragEnd).
    useEffect(() => () => { collideRef.current?.visible(false); }, []);
    for (const f of furniture) {
        if (f.topDownUrl) ensureImage(f.topDownUrl);
    }

    // Đường gióng wall-snap (vẽ imperative trong lúc kéo để không re-render gián đoạn).
    const guideRef = useRef<Konva.Line | null>(null);
    // Ô đỏ báo chồng lấn khi kéo cửa (imperative, dùng chung 1 node cho mọi cửa).
    const collideRef = useRef<Konva.Rect | null>(null);
    // Lệnh move-wall-item dự kiến (null = đang chồng lấn → không commit).
    const pendingWallMoveRef = useRef<{ entityId: string; hostWallId: string; t: number; side: number } | null>(null);
    // Vị trí px hợp lệ gần nhất của furniture-thường đang kéo (để "dừng" vật khi đụng).
    const lastSafePosRef = useRef<{ x: number; y: number } | null>(null);
    // Neighbor boxes (đồ KHÁC) — bất biến trong 1 gesture nên gom 1 lần ở onDragStart,
    // tránh buildFurnitureBoxes2D (alloc O(F)) mỗi mousemove.
    const neighborBoxesRef = useRef<FurnitureBox[] | null>(null);
    // Vị trí world-space TRƯỚC khi kéo (cho command-inverse undo, R3).
    const dragFromPosRef = useRef<{ x: number; z: number } | null>(null);
    // Wall-move trước khi kéo cửa (cho command-inverse undo, R3).
    const dragFromWallRef = useRef<{ hostWallId: string; t: number; side: number } | null>(null);

    /**
     * Kéo cửa: chiếu node lên tường gần nhất (free-drag → bám tường), GIỮ side hiện tại,
     * tô đỏ khi chồng opening khác hoặc khi cửa rời khỏi mọi tường.
     * Đặt node + rotation imperative để không re-render.
     */
    function projectWallItem(node: Konva.Group, f: Furniture2D): void {
        const pos = node.position();
        const worldX = (pos.x - originX) / PX_PER_WORLD;
        const worldZ = (pos.y - originY) / PX_PER_WORLD;
        const footprintWidth = (f.cutWidthPx ?? f.width) / PX_PER_WORLD;
        const proj = projectToNearestWall(walls, nodeById, worldX, worldZ, originX, originY, footprintWidth, f.wallSide ?? 1, f.hostWallId, resolveWallItemDims(f.modelId));
        if (!proj) {
            // Cửa xa mọi tường → tô đỏ tại vị trí node hiện tại.
            pendingWallMoveRef.current = null;
            showCollide({ cx: pos.x, cy: pos.y, rotDeg: node.rotation() }, f);
            return;
        }

        node.position({ x: proj.cx, y: proj.cy });
        node.rotation(proj.rotDeg);

        const occ = buildOpeningOccupancy(furniture, proj.hostWallId, proj.wallLen, f.entityId);
        // Lane của item đang kéo: cửa chiếm cả hai mặt; kệ chiếm mặt mới (proj.side).
        const lane = occupancyLane(f.wallBehavior ?? "mount", proj.side);
        const colliding = occupiedOverlaps(proj.t, proj.halfWidthT, lane, buildOccupiedRanges(occ));
        pendingWallMoveRef.current = colliding
            ? null
            : { entityId: f.entityId, hostWallId: proj.hostWallId, t: proj.t, side: proj.side };
        showCollide(colliding ? { cx: proj.cx, cy: proj.cy, rotDeg: proj.rotDeg } : null, f);
    }

    /** Hiện/ẩn ô đỏ báo chồng lấn tại vị trí cửa đang kéo. */
    function showCollide(at: { cx: number; cy: number; rotDeg: number } | null, f: Furniture2D): void {
        const r = collideRef.current;
        if (!r) return;
        if (at) {
            r.position({ x: at.cx, y: at.cy });
            r.rotation(at.rotDeg);
            r.size({ width: f.width, height: f.depth });
            r.offsetX(f.width / 2);
            r.offsetY(f.depth / 2);
            r.visible(true);
        } else {
            r.visible(false);
        }
        r.getLayer()?.batchDraw();
    }

    /**
     * Kéo furniture-thường: snap (edge + wall) qua resolveAlignment, rồi check
     * HARD-collision (tường + đồ khác) như 3D. Mirror handleFurnitureTranslate:
     *   - Trống → node "teleport" tới vị trí intended, cập nhật lastSafe, ẩn ô đỏ.
     *   - Đụng → node GIỮ ở lastSafe (vật dừng lại), ô đỏ trôi theo con trỏ (intended).
     * Trả về world coords ĐÃ commit lên node để onDragEnd dispatch MOVE_FURNITURE.
     */
    function applyFurnitureDrag(node: Konva.Group, f: Furniture2D): { x: number; z: number } {
        const pos = node.position();
        const r = resolveAlignment({
            cx: (pos.x - originX) / PX_PER_WORLD,
            cz: (pos.y - originY) / PX_PER_WORLD,
            hw: f.width / (2 * PX_PER_WORLD),
            hd: f.depth / (2 * PX_PER_WORLD),
            rotY: konvaDegToThreeRotY(f.rotDeg),
            walls: wallSegments,
            // Neighbor boxes gom sẵn ở onDragStart (bất biến trong gesture) — fallback nếu thiếu.
            neighbors: neighborBoxesRef.current ?? buildFurnitureBoxes2D(furniture, originX, originY, f.entityId),
        });
        const intendedX = r.x * PX_PER_WORLD + originX;
        const intendedY = r.z * PX_PER_WORLD + originY;

        // OBB tại vị trí intended → check va chạm tường (miter polygon) + đồ khác (bỏ qua chính nó).
        const poly = obbCorners(intendedX, intendedY, f.width, f.depth, f.rotDeg);
        const colliding = collidesWithWalls(poly, walls) || collidesWithFurniture(poly, furniture, f.entityId);

        if (!colliding) {
            node.position({ x: intendedX, y: intendedY });
            lastSafePosRef.current = { x: intendedX, y: intendedY };
            showCollide(null, f);
            renderGuide(r.guides);
            return { x: r.x, z: r.z };
        }
        // Đụng: dừng vật ở vị trí an toàn cuối; ô đỏ báo nơi con trỏ muốn đặt.
        const safe = lastSafePosRef.current ?? { x: f.x, y: f.y };
        node.position(safe);
        showCollide({ cx: intendedX, cy: intendedY, rotDeg: f.rotDeg }, f);
        renderGuide([]);
        return { x: (safe.x - originX) / PX_PER_WORLD, z: (safe.y - originY) / PX_PER_WORLD };
    }

    function renderGuide(guides: { x1: number; z1: number; x2: number; z2: number }[]): void {
        const line = guideRef.current;
        if (!line) return;
        if (guides.length > 0) {
            const g = guides[0];
            line.points([
                g.x1 * PX_PER_WORLD + originX, g.z1 * PX_PER_WORLD + originY,
                g.x2 * PX_PER_WORLD + originX, g.z2 * PX_PER_WORLD + originY,
            ]);
            line.visible(true);
        } else {
            line.visible(false);
        }
        line.getLayer()?.batchDraw();
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
                            // Reset ô đỏ phòng trường hợp kẹt từ drag trước (imperative không
                            // được React reset nếu prop visible={false} không thay đổi).
                            showCollide(null, f);
                            // Vị trí ban đầu là an toàn — mốc để "dừng" khi đụng tường/đồ ngay từ đầu.
                            lastSafePosRef.current = { x: f.x, y: f.y };
                            // Ghi lại vị trí world-space TRƯỚC gesture để có thể tạo inverse undo (R3).
                            if (f.isWallItem) {
                                // Wall-item: lưu topology tường hiện tại.
                                if (f.hostWallId !== undefined && f.wallT !== undefined && f.wallSide !== undefined) {
                                    dragFromWallRef.current = { hostWallId: f.hostWallId, t: f.wallT, side: f.wallSide };
                                } else {
                                    dragFromWallRef.current = null;
                                }
                                dragFromPosRef.current = null;
                            } else {
                                dragFromPosRef.current = { x: (f.x - originX) / PX_PER_WORLD, z: (f.y - originY) / PX_PER_WORLD };
                                dragFromWallRef.current = null;
                                // Gom neighbor boxes 1 lần cho cả gesture.
                                neighborBoxesRef.current = buildFurnitureBoxes2D(furniture, originX, originY, f.entityId);
                            }
                            dragTransactionOpenRef.current = true;
                            // Không gọi beginTransaction nữa cho move/rotate thường — dùng inverse undo (R3).
                            // Vẫn gọi cho wall-item vì MOVE_WALL_ITEM cũng cần inverse (tracked ở onDragEnd).
                        }}
                        onTransformEnd={(e: KonvaEventObject<Event>) => {
                            const node = e.target as Konva.Group;
                            // Transformer never resizes — clear any scale drift.
                            node.scaleX(1);
                            node.scaleY(1);
                            // Wall-item (cửa): rotate handle bị tắt (xem HandleLayer),
                            // nhánh này chỉ đến qua programmatic transform — bỏ qua.
                            if (f.isWallItem) return;
                            // Tái-snap góc về bội số ROT_STEP_DEG (Konva chỉ snap thị giác
                            // lúc kéo anchor) rồi đồng bộ node để tránh drift — xem RC-3.
                            const fromRotY = konvaDegToThreeRotY(f.rotDeg); // rotY TRƯỚC khi xoay
                            const rotY = snapAngleRad(konvaDegToThreeRotY(node.rotation()));
                            node.rotation(threeRotYToKonvaDeg(rotY));
                            dispatch({ type: "ROTATE_FURNITURE", entityId: f.entityId, rotY });
                            // Inverse undo cho ROTATE_FURNITURE (R3) — rẻ hơn snapshot toàn scene.
                            recordRotateUndo(f.entityId, fromRotY, rotY);
                        }}
                        onDragMove={(e: KonvaEventObject<MouseEvent>) => {
                            // Snap imperatively during drag — no ECS dispatch to avoid
                            // snapshot-driven re-renders interrupting Konva's drag gesture.
                            if (f.isWallItem) {
                                // Cửa: bám tường gần nhất (có thể nhảy tường), đỏ khi chồng opening.
                                projectWallItem(e.target as Konva.Group, f);
                                return;
                            }
                            // Snap (edge + wall) + hard-collision: vật dừng khi đụng, ô đỏ ở con trỏ.
                            // applyFurnitureDrag tự đặt node, ô đỏ và guide.
                            applyFurnitureDrag(e.target as Konva.Group, f);
                        }}
                        onDragEnd={(e: KonvaEventObject<MouseEvent>) => {
                            dragTransactionOpenRef.current = false;
                            const node = e.target as Konva.Group;
                            if (f.isWallItem) {
                                projectWallItem(node, f);
                                showCollide(null, f); // ẩn ô đỏ
                                const pending = pendingWallMoveRef.current;
                                pendingWallMoveRef.current = null;
                                const fromWall = dragFromWallRef.current;
                                dragFromWallRef.current = null;
                                if (pending) {
                                    dispatch({ type: "MOVE_WALL_ITEM", ...pending });
                                    // Inverse undo cho wall-item (R3): không dùng snapshot.
                                    if (fromWall) {
                                        recordWallItemMoveUndo(
                                            pending.entityId,
                                            fromWall.hostWallId, fromWall.t, fromWall.side,
                                            pending.hostWallId, pending.t, pending.side,
                                        );
                                    }
                                } else {
                                    // Chồng lấn / ngoài tường → trả node về vị trí cũ (không cần undo entry).
                                    node.position({ x: f.x, y: f.y });
                                    node.rotation(f.rotDeg);
                                    node.getLayer()?.batchDraw();
                                }
                                return;
                            }
                            // Commit vị trí đã-snap & an-toàn (đụng → là lastSafe). Ẩn ô đỏ + guide.
                            const { x, z } = applyFurnitureDrag(node, f);
                            neighborBoxesRef.current = null; // hết gesture — thả cache
                            showCollide(null, f);
                            renderGuide([]);
                            dispatch({ type: "MOVE_FURNITURE", entityId: f.entityId, x, z });
                            // Inverse undo cho MOVE_FURNITURE (R3) — rẻ hơn snapshot toàn scene.
                            const fromPos = dragFromPosRef.current;
                            dragFromPosRef.current = null;
                            if (fromPos) {
                                recordMoveUndo(f.entityId, fromPos.x, fromPos.z, x, z);
                            }
                        }}
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
