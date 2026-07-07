/**
 * style/types — kiểu cho StyleResolver (WP5).
 *
 * Khớp shape các file data ở src/ai/data/ (đã `draft-for-review`). StyleResolver
 * là lớp QUYẾT ĐỊNH tất định: style + role → modelId/materialId thật. Bổ trợ với
 * skills .md (lớp lời khuyên cho LLM).
 */

export type Lightness = "light" | "medium" | "dark";
export type Temperature = "warm" | "cool" | "neutral";

export type ToneTarget = { lightness: Lightness[]; temperature: Temperature[] };

export type StylePack = {
    label: string;
    wallH: number;
    wallT: number;
    palette: {
        floor: string[];
        wall: string[];
        bathFloor?: string;
        bathWall?: string;
        kitchenFloor?: string;
        wallAccent?: string;
    };
    floorTarget: ToneTarget;
    wallTarget: ToneTarget;
    avoid: ToneTarget;
    preferTraits: string[];
    avoidTraits: string[];
    density: { maxMainItemsPerRoom: number; minFreeFloorPct: number };
    lighting: { colorTempK: number; note: string };
    accents: string[];
};

export type MaterialTag = {
    category: string;
    tone: string;
    lightness: Lightness;
    temperature: Temperature;
    hex: string;
    style: string[];
    interior: boolean;
};

export type ObjectTag = {
    name: string;
    category: string;
    style: string[];
    traits: string[];
};

export type RoomType = "living" | "bedroom" | "kitchen" | "bathroom" | "dining" | "study";
export type Surface = "floor" | "wall";
