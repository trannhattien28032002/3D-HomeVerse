/**
 * useEngineSelectionSync — đồng bộ selection từ 3D engine events → useUIStore (R7/M5).
 *
 * Tách ra từ EditorPage để component chỉ còn orchestrate.
 *
 * Xử lý 3 loại engine event:
 *   entitySelected → kind "object" (furniture/wall-item GLB via gizmo)
 *   wallSelected   → kind "wall"   (tường via raycast riêng)
 *   floorSelected  → kind "room"   (sàn phòng via raycast riêng)
 *
 * Mỗi event được mirror vào useUIStore.selected để Material Sidebar đọc được
 * (cùng nguồn với selection 2D — R6 single owner).
 */
import { useEffect } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import { useUIStore } from "src/app/store/useUIStore";

export function useEngineSelectionSync(engine: EngineInstance | null): void {
    const setSelected = useUIStore(s => s.setSelected);

    // Furniture/wall-item GLB pick được qua gizmo → kind "object" (kèm di chuyển/xoay).
    useEffect(() => {
        if (!engine) return;
        return engine.api.events.on("entitySelected", ({ entityId }) =>
            setSelected(entityId ? { kind: "object", id: entityId } : null),
        );
    }, [engine, setSelected]);

    // Tường pick được qua raycast riêng → kind "wall" (chỉ đổi material, không gizmo).
    useEffect(() => {
        if (!engine) return;
        return engine.api.events.on("wallSelected", ({ wallId }) =>
            setSelected(wallId ? { kind: "wall", id: wallId } : null),
        );
    }, [engine, setSelected]);

    // Sàn phòng pick được qua raycast riêng → kind "room" (chỉ đổi material sàn, không gizmo).
    useEffect(() => {
        if (!engine) return;
        return engine.api.events.on("floorSelected", ({ roomKey }) =>
            setSelected(roomKey ? { kind: "room", id: roomKey } : null),
        );
    }, [engine, setSelected]);
}
