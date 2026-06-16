/**
 * Hook đăng ký phím tắt toàn cục cho editor.
 *
 * Bảng phím tắt:
 *   Ctrl+S   → save scene
 *   Ctrl+O   → mở file scene
 *   Ctrl+C   → copy đồ 3D đang chọn (đặt sàn)
 *   Ctrl+V   → paste bản sao đồ 3D đã copy (lệch chéo, undo được)
 *   V        → tool Select
 *   B        → tool Draw wall
 *   F        → mở/đóng Decor Catalog
 *   Tab      → chuyển 2D ↔ 3D
 *   Q        → Gizmo Translate (3D, không placing)
 *   W        → Gizmo Rotate (3D, không placing)
 *   Escape   → hủy placement
 *
 * Dùng paramsRef để tránh stale closure: handler luôn đọc giá trị params mới nhất
 * mà không cần re-register event listener khi props thay đổi.
 */
import { useEffect, useRef } from "react";
import type { EngineInstance, FurnitureClipboard } from "src/engine/engineTypes";
import type { Mode } from "src/app/constants/navigation";
import type { WallToolId } from "src/app/components/editor/tools/toolRegistry";

/** Độ lệch chéo (mét) mỗi lần paste để bản sao không chồng khít lên bản gốc. */
const PASTE_OFFSET_M = 0.3;

type Params = {
    engine: EngineInstance | null;
    mode: Mode;
    setMode: (m: Mode) => void;
    setTool2D: (m: WallToolId) => void;
    isPlacing: boolean;
    toggleDecorCatalog: () => void;
    onSave: () => void;
    onLoad: () => void;
    /** entityId của object đang chọn (kind "object"), hoặc null. Dùng cho Ctrl+C. */
    selectedObjectId: string | null;
};

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function useEditorShortcuts(params: Params): void {
    const paramsRef = useRef(params);
    paramsRef.current = params;

    // Clipboard copy/paste đồ 3D — giữ ngoài React state để không gây re-render.
    const clipboardRef = useRef<FurnitureClipboard | null>(null);
    // Số lần paste tính từ lần copy gần nhất — mỗi bản dán lệch chéo xa dần (cascade).
    const pasteCountRef = useRef(0);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const { engine, mode, setMode, setTool2D, isPlacing, toggleDecorCatalog, onSave, onLoad, selectedObjectId } = paramsRef.current;

            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (key === "s") { e.preventDefault(); onSave(); return; }
                if (key === "o") { e.preventDefault(); onLoad(); return; }

                // Ctrl+C — copy đồ 3D đặt sàn đang chọn. Bỏ qua khi đang gõ trong ô nhập
                // (để trình duyệt copy text như thường), hoặc không có object hợp lệ.
                if (key === "c") {
                    if (isTypingTarget(e.target) || !engine || !selectedObjectId) return;
                    const data = engine.api.getFurnitureClipboard(selectedObjectId);
                    if (!data) return; // không phải đồ đặt sàn (vd cửa/kệ/tường/sàn)
                    e.preventDefault();
                    clipboardRef.current = data;
                    pasteCountRef.current = 0;
                    return;
                }

                // Ctrl+V — paste bản sao đồ đã copy, lệch chéo dần, gói trong 1 entry undo.
                if (key === "v") {
                    if (isTypingTarget(e.target) || !engine || !clipboardRef.current) return;
                    e.preventDefault();
                    const clip = clipboardRef.current;
                    const n = (pasteCountRef.current += 1);
                    const d = PASTE_OFFSET_M * n;
                    void engine.api.asyncTransaction("paste furniture", () =>
                        engine.api.dispatchAsync({
                            type: "PLACE_FURNITURE",
                            modelId: clip.modelId,
                            x: clip.x + d,
                            z: clip.z + d,
                            rotY: clip.rotY,
                            y: clip.y,
                            materials: clip.materials,
                        }),
                    );
                    return;
                }
                return;
            }

            if (isTypingTarget(e.target)) return;

            switch (e.key.toLowerCase()) {
                case "v":
                    setTool2D("select");
                    break;
                case "b":
                    setMode("2d");
                    setTool2D("draw");
                    break;
                case "f":
                    e.preventDefault();
                    toggleDecorCatalog();
                    break;
                case "tab":
                    e.preventDefault();
                    setMode(mode === "3d" ? "2d" : "3d");
                    break;
                case "q":
                    if (mode !== "3d" || isPlacing || !engine) return;
                    e.preventDefault();
                    engine.api.setGizmoMode("translate");
                    break;
                case "w":
                    if (mode !== "3d" || isPlacing || !engine) return;
                    e.preventDefault();
                    engine.api.setGizmoMode("rotate");
                    break;
                case "escape":
                    if (!isPlacing) return;
                    e.stopPropagation();
                    engine?.api.cancelPlacement();
                    break;
                default:
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);
}
