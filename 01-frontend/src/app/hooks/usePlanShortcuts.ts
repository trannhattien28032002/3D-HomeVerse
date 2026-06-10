import { useEffect, useRef } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { Wall2D, Furniture2D } from "src/app/plan2d/types";
import type { ToolBase } from "src/app/components/editor/tools/ToolBase";
import type { ToolId, WallToolId } from "src/app/components/editor/tools/toolRegistry";

type Params = {
    engine: EngineInstance | null;
    selectedWallIds: Set<string>;
    setSelectedWallIds: (ids: Set<string>) => void;
    selectedFurnitureId: string | null;
    setSelectedFurnitureId: (id: string | null) => void;
    activeTool2D: ToolId;
    setTool2D: (m: WallToolId) => void;
    walls: Wall2D[];
    furniture: Furniture2D[];
    getActiveTool: () => ToolBase;
};

/**
 * Ngữ cảnh truyền vào mỗi action — Params cộng thêm tool đang active đã resolve.
 * Tách khỏi Params để action không phải tự gọi getActiveTool().
 */
type ShortcutCtx = Params & { activeTool: ToolBase };

/**
 * Một phím tắt khai báo: điều kiện match (key + modifier) → action.
 * - `key` so khớp không phân biệt hoa/thường (Shift+Z cho e.key = "Z").
 * - `ctrl`/`shift`: nếu set thì phải khớp đúng; nếu bỏ trống thì không quan tâm.
 *   `ctrl: true` thỏa cả Ctrl (Win/Linux) lẫn Cmd (macOS).
 * - `when`: guard tùy chọn theo state (vd: Ctrl+A chỉ chọn-tất-cả khi đang ở tool select).
 * - `preventDefault`: chặn hành vi mặc định của trình duyệt (cần cho các tổ hợp Ctrl).
 */
type Shortcut = {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    when?: (ctx: ShortcutCtx) => boolean;
    preventDefault?: boolean;
    run: (ctx: ShortcutCtx) => void;
};

// ─── Actions ────────────────────────────────────────────────────────────────
// Pure-ish: chỉ đọc/ghi qua ctx, không đóng over biến ngoài → dễ test độc lập.

/** Xóa nội thất đang chọn, hoặc nếu không có thì xóa các tường đang chọn. */
function deleteSelection(ctx: ShortcutCtx): void {
    const { engine, selectedFurnitureId, setSelectedFurnitureId, selectedWallIds, setSelectedWallIds } = ctx;
    if (!engine) return;
    if (selectedFurnitureId != null) {
        engine.api.transaction("delete furniture 2D", () => {
            engine.api.dispatch({ type: "DELETE_FURNITURE", entityId: selectedFurnitureId });
        });
        setSelectedFurnitureId(null);
    } else if (selectedWallIds.size > 0) {
        engine.api.transaction("delete walls", () => {
            for (const id of selectedWallIds) {
                engine.api.dispatch({ type: "REMOVE_WALL", wallId: id });
            }
        });
        setSelectedWallIds(new Set());
    }
}

/** Chọn toàn bộ tường (Ctrl/Cmd+A, chỉ khi đang ở tool select). */
function selectAllWalls(ctx: ShortcutCtx): void {
    ctx.setSelectedWallIds(new Set(ctx.walls.map((w) => w.id)));
}

/**
 * Hủy thao tác hiện tại và bỏ chọn. onCancel() xử lý theo từng tool:
 *   placing → complete() → endPlacement2D() (atomic: activeTool2D→"select")
 *   draw    → clear drawState (giữ nguyên tool draw trừ khi ta chủ động đổi)
 *   select  → cancelTransaction, clear drag state
 */
function cancelAndDeselect(ctx: ShortcutCtx): void {
    ctx.activeTool.onCancel();
    ctx.setSelectedWallIds(new Set());
    if (ctx.activeTool2D === "draw") ctx.setTool2D("select");
}

function undo(ctx: ShortcutCtx): void {
    ctx.engine?.api.undo();
    ctx.setSelectedWallIds(new Set());
    ctx.activeTool.onCancel();
}

function redo(ctx: ShortcutCtx): void {
    ctx.engine?.api.redo();
    ctx.setSelectedWallIds(new Set());
    ctx.activeTool.onCancel();
}

/** Lật cửa (đổi side ±1) — chỉ hoạt động khi đang chọn wall-item. Phím F. */
function flipSelectedDoor(ctx: ShortcutCtx): void {
    const { engine, selectedFurnitureId, furniture } = ctx;
    if (!engine || selectedFurnitureId == null) return;
    const f = furniture.find(x => x.entityId === selectedFurnitureId);
    if (!f || !f.isWallItem || !f.hostWallId || f.wallT === undefined) return;
    engine.api.transaction("flip door", () => {
        engine.api.dispatch({ type: "MOVE_WALL_ITEM", entityId: f.entityId, hostWallId: f.hostWallId!, t: f.wallT!, side: (f.wallSide ?? 1) * -1 });
    });
}

// ─── Keymap ───────────────────────────────────────────────────────────────────
// Bảng phím tắt 2D — đọc như mục lục, thêm/sửa/xóa phím = sửa dữ liệu, không sửa logic.
const PLAN_SHORTCUTS: Shortcut[] = [
    { key: "Delete",    run: deleteSelection },
    { key: "Backspace", run: deleteSelection },
    { key: "a", ctrl: true, preventDefault: true, when: (c) => c.activeTool2D === "select", run: selectAllWalls },
    { key: "Escape",    run: cancelAndDeselect },
    { key: "z", ctrl: true, shift: false, preventDefault: true, run: undo },
    { key: "z", ctrl: true, shift: true,  preventDefault: true, run: redo },
    { key: "y", ctrl: true,               preventDefault: true, run: redo },
    { key: "f", when: (c) => c.activeTool2D === "select" && c.selectedFurnitureId != null, run: flipSelectedDoor },
];

/** True khi event khớp điều kiện match của một shortcut (chưa xét `when`). */
function matches(s: Shortcut, e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
    if (s.ctrl !== undefined && s.ctrl !== (e.ctrlKey || e.metaKey)) return false;
    if (s.shift !== undefined && s.shift !== e.shiftKey) return false;
    return true;
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function usePlanShortcuts(params: Params): void {
    // getActiveTool có thể đổi mỗi render; ref để handler luôn gọi bản mới nhất.
    const getActiveToolRef = useRef(params.getActiveTool);
    getActiveToolRef.current = params.getActiveTool;

    const { engine, selectedWallIds, selectedFurnitureId, activeTool2D, walls, furniture } = params;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;

            const ctx: ShortcutCtx = { ...params, activeTool: getActiveToolRef.current() };

            for (const s of PLAN_SHORTCUTS) {
                if (!matches(s, e)) continue;
                if (s.when && !s.when(ctx)) continue;
                if (s.preventDefault) e.preventDefault();
                s.run(ctx);
                break; // các entry loại trừ lẫn nhau theo key/modifier — dừng ở match đầu
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // walls: Ctrl+A đọc nó để dựng full selection set.
        // furniture: phím F (flip door) đọc hostWallId/wallT/wallSide từ snapshot.
        // engine: undo/redo phải đóng over instance hiện tại.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, selectedWallIds, selectedFurnitureId, activeTool2D, walls, furniture]);
}
