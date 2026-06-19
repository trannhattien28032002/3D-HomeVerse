/**
 * useSelectionStore — selection model tách khỏi useUIStore (4.1).
 *
 * Trước đây selection trộn trong useUIStore cùng panel/tool/viewport, làm store
 * UI phình to với bất biến mutual-exclusion phức tạp. Tách ra đây để selection là
 * một concern độc lập, dễ đọc.
 *
 * Mô hình (R6 — single owner + multi-select sets):
 *   selected            — nguồn duy nhất cho Material Sidebar (object/wall/room)
 *   selectedWallIds     — multi-select 2D tường (Set<wallId>)
 *   selectedFurnitureIds — multi-select 2D object/furniture (Set<entityId>)
 *   2 set tách với `selected` vì sidebar chỉ cần 1 mục tại một thời điểm nhưng 2D
 *   cho phép chọn nhiều để kéo/xóa hàng loạt (vd Ctrl+A).
 *
 *   Bất biến mutual-exclusion: tường ↔ object loại trừ nhau cho thao tác thường —
 *   setSelectedWallIds(non-empty) tự xóa selectedFurnitureIds và ngược lại. Ngoại lệ
 *   duy nhất là selectAll2D (Ctrl+A) set cả hai cùng lúc, bỏ qua cross-clear.
 *
 *   Khi một set có size === 1 → `selected` tự sync sang {kind} tương ứng để feed sidebar;
 *   size 0/>1 → sidebar không hiển thị (selected = null/giữ nguyên).
 *
 * Liên hệ với UI: khi selection về null → đóng Material Sidebar. Cờ
 * `isMaterialSidebarOpen` vẫn thuộc useUIStore (panel UI), nên đây gọi chéo một
 * chiều selection → UI (useUIStore KHÔNG import store này — tránh vòng phụ thuộc).
 */
import { create } from "zustand";
import { useUIStore } from "src/app/store/useUIStore";

/**
 * Mục tiêu đang được chọn (dùng chung 2D & 3D) — nguồn cho Material Sidebar.
 *   - object: id = ECS entityId (furniture / wall-item GLB)
 *   - wall:   id = wallId
 *   - room:   id = roomKey (sorted nodeIds)
 */
export type SelectedTarget =
    | { kind: "object"; id: string }
    | { kind: "wall"; id: string }
    | { kind: "room"; id: string };

type SelectionState = {
    /** Mục tiêu đang được chọn (object/wall/room) — nguồn duy nhất cho Material Sidebar (R6). */
    selected: SelectedTarget | null;
    setSelected: (target: SelectedTarget | null) => void;
    /**
     * Tập hợp tường đang được chọn trong Plan 2D (multi-select) — R6 owner duy nhất.
     * Material Sidebar dùng `selected` (1 wall); 2D dùng selectedWallIds cho drag/delete nhiều.
     * Khi selectedWallIds.size === 1 → `selected` tự động sync sang {kind:"wall"}.
     */
    selectedWallIds: Set<string>;
    setSelectedWallIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    /**
     * Tập object/furniture đang chọn trong Plan 2D (multi-select). Mutual-exclusive với
     * selectedWallIds. size === 1 → sync `selected` sang {kind:"object"}.
     */
    selectedFurnitureIds: Set<string>;
    setSelectedFurnitureIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    /** Ctrl+A — chọn đồng thời mọi tường + mọi object (bỏ qua mutual-exclusion). */
    selectAll2D: (wallIds: Set<string>, furnitureIds: Set<string>) => void;
};

/** Đóng Material Sidebar khi selection về null (cờ sống ở useUIStore). */
function closeSidebarIfNoSelection(selected: SelectedTarget | null): void {
    if (selected === null) useUIStore.getState().closeMaterialSidebar();
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
    selected: null,
    // Đổi selection → đóng sidebar nếu bỏ chọn (null) để không treo panel mồ côi.
    // Đồng thời reconcile 2 set multi-select 2D để chúng không lệch với single-owner
    // `selected` (vd 3D chọn object → set selectedFurnitureIds tương ứng cho 2D highlight).
    setSelected: (target) => {
        set({
            selected: target,
            selectedWallIds:      target?.kind === "wall"   ? new Set([target.id]) : new Set<string>(),
            selectedFurnitureIds: target?.kind === "object" ? new Set([target.id]) : new Set<string>(),
        });
        closeSidebarIfNoSelection(target);
    },
    selectedWallIds: new Set<string>(),
    setSelectedWallIds: (idsOrFn) => {
        const s = get();
        const next = typeof idsOrFn === "function" ? idsOrFn(s.selectedWallIds) : idsOrFn;
        // Auto-sync `selected` từ wall selection (R6): 1 tường → feed sidebar; 0/>1 → không.
        const newSelected = next.size === 1
            ? { kind: "wall" as const, id: [...next][0] }
            : next.size === 0
                ? (s.selected?.kind === "wall" ? null : s.selected)
                : (s.selected?.kind === "object" ? null : s.selected);
        set({
            selectedWallIds: next,
            // Mutual-exclusion: chọn tường → bỏ chọn object (Ctrl+A đi qua selectAll2D nên không bị).
            selectedFurnitureIds: next.size > 0 ? new Set<string>() : s.selectedFurnitureIds,
            selected: newSelected,
        });
        closeSidebarIfNoSelection(newSelected);
    },
    selectedFurnitureIds: new Set<string>(),
    setSelectedFurnitureIds: (idsOrFn) => {
        const s = get();
        const next = typeof idsOrFn === "function" ? idsOrFn(s.selectedFurnitureIds) : idsOrFn;
        // Đối xứng với setSelectedWallIds: 1 object → feed sidebar; 0/>1 → không.
        const newSelected = next.size === 1
            ? { kind: "object" as const, id: [...next][0] }
            : next.size === 0
                ? (s.selected?.kind === "object" ? null : s.selected)
                : (s.selected?.kind === "wall" ? null : s.selected);
        set({
            selectedFurnitureIds: next,
            // Mutual-exclusion: chọn object → bỏ chọn tường.
            selectedWallIds: next.size > 0 ? new Set<string>() : s.selectedWallIds,
            selected: newSelected,
        });
        closeSidebarIfNoSelection(newSelected);
    },
    selectAll2D: (wallIds, furnitureIds) => {
        set({
            selectedWallIds: wallIds,
            selectedFurnitureIds: furnitureIds,
            // Multi cả 2 loại → không có single target cho sidebar; đóng panel.
            selected: null,
        });
        useUIStore.getState().closeMaterialSidebar();
    },
}));
