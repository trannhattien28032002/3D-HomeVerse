/**
 * FloorMaterialPanel — nhánh "room" của MaterialSidebar: sàn phòng (1 surface, không slot).
 *
 * MaterialGrid preset sàn → SET_FLOOR_MATERIAL / RESET_FLOOR_MATERIAL. State (floorMaterialId)
 * khởi tạo từ engine khi mount; reset khi đổi target nhờ remount qua `key`. Tách từ index.tsx
 * (Phase 5.6).
 */
import { useState } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import { T } from "src/app/constants/designTokens";
import { MaterialGrid } from "./MaterialGrid";
import { getFloorCategories } from "./materialCatalog";
import { ResetButton } from "./ResetButton";

type Props = {
    engine: EngineInstance | null;
    roomKey: string;
};

export function FloorMaterialPanel({ engine, roomKey }: Props) {
    const [floorMaterialId, setFloorMaterialId] = useState<string | null>(() =>
        engine ? engine.api.getFloorMaterial(roomKey) : null
    );

    function handleFloorPick(materialId: string) {
        if (!engine) return;
        engine.api.transaction("change floor material", () => {
            engine.api.dispatch({ type: "SET_FLOOR_MATERIAL", roomKey, materialId });
        });
        setFloorMaterialId(materialId);
    }

    function handleFloorReset() {
        if (!engine) return;
        engine.api.transaction("reset floor material", () => {
            engine.api.dispatch({ type: "RESET_FLOOR_MATERIAL", roomKey });
        });
        setFloorMaterialId(null);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                <span style={{ fontSize: 11, color: T.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    Material · Bề mặt sàn
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(213,196,172,0.3)" }} />
                <ResetButton onClick={handleFloorReset} />
            </div>
            <MaterialGrid
                allowedCategories={getFloorCategories()}
                selectedId={floorMaterialId}
                onPick={handleFloorPick}
            />
        </div>
    );
}
