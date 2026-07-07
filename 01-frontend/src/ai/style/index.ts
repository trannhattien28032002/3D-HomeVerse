/** style — StyleResolver public API (WP5). */
export type { StylePack, ToneTarget, MaterialTag, ObjectTag, RoomType, Surface } from "src/ai/style/types";
export {
    listStyleIds, getStylePack, pickFloorMaterial, pickWallMaterial,
    materialsMatchingTarget, pickModelForRole, type StyleId,
} from "src/ai/style/styleResolver";
export { recipeToIntents, type RecipeResult } from "src/ai/style/recipeToIntents";
