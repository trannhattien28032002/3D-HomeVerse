import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type Konva from "konva";
import { Layer, Transformer } from "react-konva";
import { ROT_STEP_DEG } from "src/shared/constants/placement";
import type { Furniture2D } from "src/app/store/useFloorPlanSnapshot";

type Props = {
    transformerRef: MutableRefObject<Konva.Transformer | null>;
    furnitureNodeRefs: MutableRefObject<Map<number, Konva.Group>>;
    selectedFurnitureId: number | null;
    isSelectMode: boolean;
    /** Passed as dep so the attach-effect re-runs when snapshot changes. */
    furniture: Furniture2D[];
    ss: (px: number) => number;
};

export function HandleLayer({ transformerRef, furnitureNodeRefs, selectedFurnitureId, isSelectMode, furniture, ss }: Props) {
    const ROTATION_SNAPS = useMemo(() => Array.from({ length: 24 }, (_, i) => i * ROT_STEP_DEG), []);

    // Attach / detach Transformer to selected furniture node.
    // Runs on every snapshot so it rebinds to the fresh Konva node after re-render.
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
                rotateEnabled={isSelectMode}
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
