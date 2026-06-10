/**
 * usePlacementRouting — routing khi người dùng chọn item từ DecorCatalog (R7/M5).
 *
 * Tách ra từ EditorPage để component không chứa logic phân nhánh placement.
 *
 * Logic:
 *   - Nếu mode !== "3d" VÀ item có constraint "wall" → beginWallPlacement2D (2D wall-mount tool).
 *   - Nếu mode === "3d" → engine.beginPlacement (3D placement với ghost GLB).
 *   - Nếu mode !== "3d" và constraint !== "wall" → beginPlacement2D (2D floor placement).
 *
 * Trả về onDecorSelect callback để spread vào DecorCatalog.onSelect.
 */
import { useUIStore } from "src/app/store/useUIStore";
import { getPlacement } from "src/engine/catalog/FurnitureCatalog";
import type { EngineInstance } from "src/engine/engineTypes";
import type { Mode } from "src/app/constants/navigation";

export function usePlacementRouting(engine: EngineInstance | null, mode: Mode): (id: string) => void {
    const closeDecorCatalog  = useUIStore(s => s.closeDecorCatalog);
    const beginPlacement2D   = useUIStore(s => s.beginPlacement2D);
    const beginWallPlacement2D = useUIStore(s => s.beginWallPlacement2D);

    return (id: string) => {
        closeDecorCatalog();
        if (mode !== "3d" && getPlacement(id).constraint === "wall") {
            beginWallPlacement2D(id);
            return;
        }
        if (mode === "3d") engine?.api.beginPlacement(id);
        else beginPlacement2D(id);
    };
}
