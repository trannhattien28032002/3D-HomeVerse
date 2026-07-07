import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { getMaterialsRaw } from "src/shared/catalog/catalogStore";
import { resolveAssetUrl } from "src/shared/catalog/assetUrl";

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

/** Texture set của một material (path .ktx2 — nguồn sự thật từ catalogStore). */
interface RawTextures {
    color?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
}

/** Các category mà engine union hỗ trợ trực tiếp. */
const KNOWN_CATEGORIES: ReadonlySet<MaterialCategory> = new Set<MaterialCategory>([
    "fabric", "concrete", "metal", "wood", "tile", "brick", "ground", "stone", "other",
]);

/** Alias category slug của catalog → category engine (những slug không nằm trong union). */
const CATEGORY_ALIAS: Record<string, MaterialCategory> = {
    woodfloor: "wood",
    paving: "stone",
    grass: "ground",
    plaster: "other",
    plastic: "other",
};

/** Quy category slug của catalog về MaterialCategory của engine (fallback "other"). */
function toMaterialCategory(cat: string): MaterialCategory {
    if (CATEGORY_ALIAS[cat]) return CATEGORY_ALIAS[cat];
    return KNOWN_CATEGORIES.has(cat as MaterialCategory) ? (cat as MaterialCategory) : "other";
}

/** Catalog material suy ra từ catalogStore (id, label, category engine, thumbnail). */
function buildCatalog(): MaterialEntry[] {
    return getMaterialsRaw().materials.map((m) => ({
        id: m.id,
        label: toLabel(m.id),
        category: toMaterialCategory(m.category),
        thumbnail: m.icon,
    }));
}

/** Tra textures của một material theo id (đọc trực tiếp catalogStore). */
function texturesById(id: string): RawTextures | undefined {
    return getMaterialsRaw().materials.find((m) => m.id === id)?.textures;
}

export class MaterialLibrary {
    /** Catalog material hiện tại (suy ra từ catalogStore đã hydrate). */
    static get catalog(): MaterialEntry[] {
        return buildCatalog();
    }

    private ktx2    = new KTX2Loader();
    private matCache = new Map<string, THREE.MeshStandardMaterial>();
    private texCache = new Map<string, Promise<THREE.Texture | null>>();

    constructor(renderer: THREE.WebGLRenderer) {
        this.ktx2.setTranscoderPath("/basis/").detectSupport(renderer);
    }

    async loadMaterial(id: string): Promise<THREE.MeshStandardMaterial | null> {
        const hit = this.matCache.get(id);
        if (hit) return hit;

        // Path texture đọc THẲNG từ catalogStore (nguồn sự thật duy nhất, chỉ .ktx2).
        const tx = texturesById(id);
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
                resolveAssetUrl(path)!,
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
