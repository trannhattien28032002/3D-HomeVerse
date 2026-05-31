/**
 * TopDownSprite — shared Konva renderer for a furniture top-down image.
 *
 * Used by both the placed-furniture layer (PlanView2D) and the placement ghost
 * (PlaceFurnitureTool) so they stay pixel-identical.
 *
 * Two corrections vs. drawing the raw PNG into the footprint box:
 *   1. Crop to the opaque alpha bbox (getImageCrop) — the authored PNGs are square
 *      canvases with transparent margins, so the raw square would shrink the object.
 *   2. Rotate 90° when the sprite's long axis disagrees with the footprint's long
 *      axis (the GLB and the PNG may define "length" on different axes). −90° was
 *      chosen so the object's front faces the same way as the 3D model.
 *
 * The caller positions/rotates the parent Group; this component only draws the image
 * centred on the Group origin, filling exactly width × depth (in px).
 */
import { Image as KonvaImage } from "react-konva";
import { getImageCrop } from "src/app/components/editor/furnitureImages";

/** Base turn applied when sprite/footprint orientations disagree (screen-CW degrees). */
const TURN_DEG = -90;

export function TopDownSprite({ image, url, width, depth }: {
    image: HTMLImageElement;
    url: string | undefined;
    width: number;  // footprint width in px (world X extent)
    depth: number;  // footprint depth in px (world Z extent)
}) {
    const crop = url ? getImageCrop(url) : null;
    const cropProps = crop
        ? { crop: { x: crop.sx, y: crop.sy, width: crop.sw, height: crop.sh } }
        : {};

    const imgPortrait = crop ? crop.sh > crop.sw : false;
    const boxPortrait = depth > width;

    if (imgPortrait !== boxPortrait) {
        // Turned 90°: swap draw extents so the on-screen footprint stays width × depth.
        return (
            <KonvaImage
                image={image}
                {...cropProps}
                width={depth} height={width}
                offsetX={depth / 2} offsetY={width / 2}
                rotation={TURN_DEG}
            />
        );
    }
    return (
        <KonvaImage
            image={image}
            {...cropProps}
            width={width} height={depth}
            offsetX={width / 2} offsetY={depth / 2}
        />
    );
}
