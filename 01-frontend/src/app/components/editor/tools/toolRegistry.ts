/**
 * toolRegistry — single source of truth cho tất cả 2D tool.
 *
 * Trước Đợt 5: thêm 1 tool mới cần sửa 4-5 chỗ (useUIStore union, PlanView2D
 * switch + cleanup, usePlanShortcuts union, ...). Sau Đợt 5: chỉ thêm 1 entry
 * vào `TOOL_REGISTRY` bên dưới — type {@link ToolId} và iteration tự pick up.
 *
 * Nav (BOTTOM_NAV ở constants/navigation.ts) là domain khác — không 1:1 với
 * tool (ví dụ "decor" mở DecorCatalog modal, không phải là 1 tool). Vì vậy
 * BottomNavBar không nằm trong registry này.
 *
 * Use case:
 *   - PlanView2D: `const tools = useRef(createToolInstances())` → activeTool =
 *     `tools.current[activeTool2D]`. Lifecycle deactivate cũng iterate qua đây.
 *   - useUIStore.activeTool2D: dùng `ToolId` thay literal union.
 *   - usePlanShortcuts: cùng vậy + dùng `WallToolId` cho setTool2D param.
 */
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import { SelectTool } from "src/app/components/editor/tools/SelectTool";
import { DrawWallTool } from "src/app/components/editor/tools/DrawWallTool";
import { PlaceFurnitureTool } from "src/app/components/editor/tools/PlaceFurnitureTool";

/**
 * Mọi tool id — single source for type và iteration.
 *
 * Convention: thêm tool mới = add entry vào TOOL_REGISTRY bên dưới (TOOL_IDS
 * + ToolId được derive tự động). Đừng tạo string literal `"select"` rời rạc.
 */
export const TOOL_IDS = ["select", "draw", "placing"] as const;
export type ToolId = typeof TOOL_IDS[number];

/**
 * Subset của ToolId — tool có thể switch trực tiếp (không cần placementModelId).
 * Dùng cho `setTool2D(mode)` parameter type.
 */
export type WallToolId = Exclude<ToolId, "placing">;

export type ToolDef = {
    id: ToolId;
    /** Human label — UI có thể show trong nav hoặc tooltip. */
    label: string;
    /** Single-key shortcut (chưa wire — placeholder cho future BottomNavBar/HelpOverlay). */
    shortcut?: string;
    /** Factory — return fresh instance. Caller chịu trách nhiệm giữ ref. */
    create: () => ToolBase;
};

export const TOOL_REGISTRY: Record<ToolId, ToolDef> = {
    select:  { id: "select",  label: "Select",          shortcut: "v", create: () => new SelectTool() },
    draw:    { id: "draw",    label: "Draw Wall",       shortcut: "w", create: () => new DrawWallTool() },
    placing: { id: "placing", label: "Place Furniture",                create: () => new PlaceFurnitureTool() },
};

/**
 * Create one instance per tool. Return record là **stable** — caller nên cache
 * trong `useRef(createToolInstances())` để giữ reference qua re-renders.
 *
 * Đợt 5 thay 3 useRef + switch lựa tool ở PlanView2D bằng 1 useRef + lookup.
 */
export function createToolInstances(): Record<ToolId, ToolBase> {
    const out = {} as Record<ToolId, ToolBase>;
    for (const id of TOOL_IDS) out[id] = TOOL_REGISTRY[id].create();
    return out;
}
