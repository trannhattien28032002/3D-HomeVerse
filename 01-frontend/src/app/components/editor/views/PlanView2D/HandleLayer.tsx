import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import { Layer, Transformer } from "react-konva";
import { ROT_STEP_DEG } from "src/shared/constants/placement";
import type { Furniture2D } from "src/app/plan2d/types";

type Props = {
    transformerRef: MutableRefObject<Konva.Transformer | null>;
    furnitureNodeRefs: MutableRefObject<Map<string, Konva.Group>>;
    selectedFurnitureId: string | null;
    isSelectMode: boolean;
    /** Truyền vào làm dependency để effect gắn kết chạy lại khi snapshot thay đổi. */
    furniture: Furniture2D[];
    /** True khi item đang chọn là wall-item → ẩn rotate handle (flip qua phím F). */
    selectedIsWallItem: boolean;
    ss: (px: number) => number;
};

export function HandleLayer({ transformerRef, furnitureNodeRefs, selectedFurnitureId, isSelectMode, furniture, selectedIsWallItem, ss }: Props) {
    const ROTATION_SNAPS = useMemo(() => Array.from({ length: 24 }, (_, i) => i * ROT_STEP_DEG), []);

    // Gắn / gỡ Transformer vào node nội thất đang được chọn.
    // Chạy mỗi khi có snapshot để gắn lại vào node Konva mới sau khi re-render.
    useEffect(() => {
        const tr = transformerRef.current;
        if (!tr) return;
        const node = (isSelectMode && selectedFurnitureId != null)
            ? furnitureNodeRefs.current.get(selectedFurnitureId) ?? null
            : null;
        tr.nodes(node ? [node] : []);
        tr.getLayer()?.batchDraw();
    }, [selectedFurnitureId, isSelectMode, furniture]);

    return (
        <Layer>
            <Transformer
                ref={transformerRef}
                resizeEnabled={false}
                rotateEnabled={isSelectMode && !selectedIsWallItem}
                flipEnabled={false}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={ROT_STEP_DEG / 2}
                anchorSize={ss(10)}
                anchorStroke="#7c5800"
                anchorFill="#f8b400"
                borderStroke="#f8b400"
                borderStrokeWidth={ss(1)}
                ignoreStroke
            />
        </Layer>
    );
}
