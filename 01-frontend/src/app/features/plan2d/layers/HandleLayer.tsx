import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import { Layer, Transformer } from "react-konva";
import { ROT_STEP_DEG } from "src/shared/constants/placement";
import { T } from "src/app/constants/designTokens";
import type { Furniture2D } from "src/app/features/plan2d/types";

type Props = {
    transformerRef: MutableRefObject<Konva.Transformer | null>;
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
    /** Tập item đang chọn (multi-select) — Transformer gắn vào MỌI node để xoay nhóm. */
    selectedFurnitureIds: Set<string>;
    isSelectMode: boolean;
    /** Truyền vào làm dependency để effect gắn kết chạy lại khi snapshot thay đổi. */
    furniture: Furniture2D[];
    ss: (px: number) => number;
};

export function HandleLayer({ transformerRef, furnitureNodeRefs, selectedFurnitureIds, isSelectMode, furniture, ss }: Props) {
    const ROTATION_SNAPS = useMemo(() => Array.from({ length: 24 }, (_, i) => i * ROT_STEP_DEG), []);

    // Tập chọn có chứa wall-item? → ẩn rotate handle (cửa/kệ flip bằng phím, không xoay
    // tự do; nhất quán single lẫn nhóm hỗn hợp — chốt Phase 2).
    const containsWallItem = useMemo(
        () => [...selectedFurnitureIds].some(id => furniture.find(f => f.entityId === id)?.isWallItem),
        [selectedFurnitureIds, furniture],
    );

    // Gắn / gỡ Transformer vào MỌI node nội thất đang được chọn (1 hoặc nhiều).
    // Chạy mỗi khi có snapshot để gắn lại vào node Konva mới sau khi re-render.
    useEffect(() => {
        const tr = transformerRef.current;
        if (!tr) return;
        const nodes: Konva.Group[] = [];
        if (isSelectMode) {
            for (const id of selectedFurnitureIds) {
                const node = furnitureNodeRefs.current.get(id);
                if (node) nodes.push(node);
            }
        }
        tr.nodes(nodes);
        tr.getLayer()?.batchDraw();
    }, [selectedFurnitureIds, isSelectMode, furniture]);

    return (
        <Layer>
            <Transformer
                ref={transformerRef}
                resizeEnabled={false}
                rotateEnabled={isSelectMode && !containsWallItem}
                flipEnabled={false}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={ROT_STEP_DEG / 2}
                anchorSize={ss(10)}
                anchorStroke={T.primary}
                anchorFill={T.primaryContainer}
                borderStroke={T.primaryContainer}
                borderStrokeWidth={ss(1)}
                ignoreStroke
            />
        </Layer>
    );
}
