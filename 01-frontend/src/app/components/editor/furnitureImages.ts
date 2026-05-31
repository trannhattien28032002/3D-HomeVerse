/**
 * furnitureImages — image loader/cache for top-down furniture sprites.
 *
 * ensureImage(url)  — triggers load if not already started
 * getLoadedImage(url) — returns cached HTMLImageElement, or null if not ready
 * getImageCrop(url) — returns the tight alpha bounding box {sx,sy,sw,sh}, or null
 * subscribeImages(fn) — calls fn whenever any image finishes loading (React re-render hook)
 *
 * Why crop? The authored PNGs are square 1080² canvases with the object centred and
 * surrounded by transparent margins. Drawing the whole square into the furniture
 * footprint box squashes the object and leaves it tiny. We measure the opaque region
 * once per image so the floor-plan can draw just the object, scaled to its real footprint.
 */

type CacheEntry = HTMLImageElement | "loading";
/** Tight bounding box of the opaque pixels, in source-image pixel coords. */
export type ImageCrop = { sx: number; sy: number; sw: number; sh: number };

const cache = new Map<string, CacheEntry>();
const cropCache = new Map<string, ImageCrop>();
const listeners = new Set<() => void>();

/** Alpha threshold (0-255) below which a pixel counts as background. */
const ALPHA_THRESHOLD = 20;

/**
 * Scan the image's alpha channel and store the tight opaque bounding box.
 * Falls back to the full image when the canvas read fails (e.g. tainted) or the
 * image is fully transparent.
 */
function computeCrop(url: string, img: HTMLImageElement): void {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) return;

    const full: ImageCrop = { sx: 0, sy: 0, sw: w, sh: h };

    try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) { cropCache.set(url, full); return; }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                if (data[row + x * 4 + 3] > ALPHA_THRESHOLD) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < minX || maxY < minY) { cropCache.set(url, full); return; }
        cropCache.set(url, { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 });
    } catch {
        cropCache.set(url, full);
    }
}

export function ensureImage(url: string): void {
    if (cache.has(url)) return;
    cache.set(url, "loading");
    const img = new Image();
    img.onload = () => {
        cache.set(url, img);
        computeCrop(url, img);
        listeners.forEach(fn => fn());
    };
    img.onerror = () => {
        cache.delete(url);
    };
    img.src = url;
}

export function getLoadedImage(url: string): HTMLImageElement | null {
    const entry = cache.get(url);
    return entry instanceof HTMLImageElement ? entry : null;
}

/** Tight opaque bounding box for the image, or null if not measured yet. */
export function getImageCrop(url: string): ImageCrop | null {
    return cropCache.get(url) ?? null;
}

export function subscribeImages(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
