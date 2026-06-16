import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import materialsData from "src/data/catalog/materials.json";

export type MaterialCategory =
    | "fabric" | "concrete" | "metal" | "wood"
    | "tile"   | "brick"    | "ground" | "stone" | "other";

export interface MaterialEntry {
    id: string;
    label: string;
    category: MaterialCategory;
    /** Thumbnail PNG phục vụ picker UI */
    thumbnail: string;
}

function toLabel(id: string): string {
    return id
        .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase word split
        .replace(/([A-Za-z])(\d)/g, "$1 $2");   // letter→digit split
}

function entry(id: string, category: MaterialCategory): MaterialEntry {
    return {
        id,
        label: toLabel(id),
        category,
        thumbnail: `/materials/${id}_1K-JPG/${id}.webp`,
    };
}

export const MATERIAL_CATALOG: MaterialEntry[] = [
    // Fabric
    entry("Fabric018",          "fabric"),
    entry("Fabric054",          "fabric"),
    entry("Fabric055",          "fabric"),
    entry("Fabric063",          "fabric"),
    entry("Fabric081A",         "fabric"),
    entry("Fabric083",          "fabric"),
    // Concrete
    entry("Concrete028",        "concrete"),
    entry("Concrete034",        "concrete"),
    entry("Concrete042A",       "concrete"),
    entry("Concrete046",        "concrete"),
    entry("Concrete047A",       "concrete"),
    entry("Concrete048",        "concrete"),
    // Metal
    entry("CorrugatedSteel009", "metal"),
    entry("Metal046B",          "metal"),
    entry("Metal049A",          "metal"),
    entry("Metal055A",          "metal"),
    entry("Metal063",           "metal"),
    // Wood
    entry("Planks037A",         "wood"),
    entry("Wood026",            "wood"),
    entry("Wood051",            "wood"),
    entry("Wood060",            "wood"),
    entry("Wood066",            "wood"),
    entry("Wood067",            "wood"),
    entry("Wood092",            "wood"),
    entry("Wood094",            "wood"),
    entry("Wood095",            "wood"),
    entry("WoodFloor039",       "wood"),
    entry("WoodFloor040",       "wood"),
    entry("WoodFloor043",       "wood"),
    entry("WoodFloor051",       "wood"),
    entry("WoodFloor064",       "wood"),
    entry("WoodFloor070",       "wood"),
    // Tile
    entry("Tiles105",           "tile"),
    entry("Tiles107",           "tile"),
    entry("Tiles132A",          "tile"),
    entry("Tiles133A",          "tile"),
    entry("Tiles138",           "tile"),
    // Brick
    entry("Bricks058",          "brick"),
    entry("Bricks085",          "brick"),
    entry("Bricks104",          "brick"),
    // Ground
    entry("Asphalt031",         "ground"),
    entry("Grass001",           "ground"),
    entry("Grass004",           "ground"),
    entry("Grass005",           "ground"),
    entry("Gravel043",          "ground"),
    entry("Ground037",          "ground"),
    entry("Ground103",          "ground"),
    entry("Road012A",           "ground"),
    // Stone
    entry("Marble012",          "stone"),
    entry("Onyx015",            "stone"),
    entry("PavingStones150",    "stone"),
    entry("Rock063",            "stone"),
    entry("Rock064",            "stone"),
    entry("Travertine009",      "stone"),
    // Other
    entry("PaintedPlaster017",  "other"),
    entry("Plaster001",         "other"),
];

/** Texture set của một material đọc từ materials.json (nguồn sự thật path). */
interface RawTextures {
    color?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
}

/** id → textures. Path trong JSON trỏ .ktx2 (nguồn sự thật duy nhất). */
const TEXTURES_BY_ID = new Map<string, RawTextures>(
    (materialsData as unknown as { materials: { id: string; textures: RawTextures }[] }).materials
        .map((m) => [m.id, m.textures] as const),
);

export class MaterialLibrary {
    static readonly catalog = MATERIAL_CATALOG;

    private ktx2    = new KTX2Loader();
    private matCache = new Map<string, THREE.MeshStandardMaterial>();
    private texCache = new Map<string, Promise<THREE.Texture | null>>();

    constructor(renderer: THREE.WebGLRenderer) {
        this.ktx2.setTranscoderPath("/basis/").detectSupport(renderer);
    }

    async loadMaterial(id: string): Promise<THREE.MeshStandardMaterial | null> {
        const hit = this.matCache.get(id);
        if (hit) return hit;

        // Path texture đọc THẲNG từ materials.json (nguồn sự thật duy nhất, chỉ .ktx2).
        const tx = TEXTURES_BY_ID.get(id);
        if (!tx) return null;

        const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
            this.texFromJson(tx.color,     true),
            this.texFromJson(tx.normal,    false),
            this.texFromJson(tx.roughness, false),
            this.texFromJson(tx.ao,        false),
        ]);

        if (!map && !normalMap && !roughnessMap && !aoMap) return null;

        const mat = new THREE.MeshStandardMaterial({
            ...(map          && { map }),
            ...(normalMap    && { normalMap }),
            ...(roughnessMap && { roughnessMap }),
            ...(aoMap        && { aoMap, aoMapIntensity: 1 }),
        });

        this.matCache.set(id, mat);
        return mat;
    }

    /** Load 1 texture .ktx2 từ path trong JSON (cache theo path, ktx2-only). */
    private texFromJson(ktx2Path: string | undefined, srgb: boolean): Promise<THREE.Texture | null> {
        if (!ktx2Path) return Promise.resolve(null);
        if (this.texCache.has(ktx2Path)) return this.texCache.get(ktx2Path)!;
        const p = this.loadKTX2(ktx2Path, srgb);
        this.texCache.set(ktx2Path, p);
        p.then(t => { if (!t) this.texCache.delete(ktx2Path); }).catch(() => this.texCache.delete(ktx2Path));
        return p;
    }

    private loadKTX2(path: string, srgb: boolean): Promise<THREE.Texture | null> {
        return new Promise(resolve => {
            this.ktx2.load(
                path,
                tex => {
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
                    resolve(tex);
                },
                undefined,
                () => resolve(null),
            );
        });
    }

    dispose(): void {
        for (const m of this.matCache.values()) m.dispose();
        for (const p of this.texCache.values()) p.then(t => t?.dispose()).catch(() => {});
        this.matCache.clear();
        this.texCache.clear();
    }
}
