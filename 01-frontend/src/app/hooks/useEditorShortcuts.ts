/**
 * Hook đăng ký phím tắt toàn cục cho editor.
 *
 * Bảng phím tắt:
 *   Ctrl+S       → lưu scene lên máy chủ (onSave)
 *   Ctrl+Shift+S → xuất file .homeverseplan xuống máy (onExport)
 *   Ctrl+O       → mở file scene
 *   Ctrl+C   → copy đồ đặt sàn đang chọn (2D: cả cụm multi-select · 3D: object đơn)
 *   Ctrl+V   → paste bản sao cả cụm đã copy (giữ layout tương đối, lệch chéo, undo được)
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
import { isTypingTarget } from "src/shared/dom/isTypingTarget";
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
    /** Xuất file .homeverseplan xuống máy (Ctrl+Shift+S). */
    onExport: () => void;
    onLoad: () => void;
    /** entityId object đang chọn ở 3D (kind "object"), hoặc null. Nguồn copy khi mode==="3d". */
    selectedObjectId: string | null;
    /** Tập furniture đang chọn ở 2D (multi-select). Nguồn copy khi mode==="2d". */
    selectedFurnitureIds: Set<string>;
};

export function useEditorShortcuts(params: Params): void {
    const paramsRef = useRef(params);
    paramsRef.current = params;

    // Clipboard copy/paste đồ đặt sàn — mảng để hỗ trợ multi-select; giữ ngoài React
    // state để không gây re-render. Rỗng = chưa copy gì.
    const clipboardRef = useRef<FurnitureClipboard[]>([]);
    // Số lần paste tính từ lần copy gần nhất — mỗi bản dán lệch chéo xa dần (cascade).
    const pasteCountRef = useRef(0);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const { engine, mode, setMode, setTool2D, isPlacing, toggleDecorCatalog, onSave, onExport, onLoad, selectedObjectId, selectedFurnitureIds } = paramsRef.current;

            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                // Ctrl+Shift+S xuất file xuống máy; Ctrl+S lưu lên máy chủ.
                if (key === "s") { e.preventDefault(); (e.shiftKey ? onExport : onSave)(); return; }
                if (key === "o") { e.preventDefault(); onLoad(); return; }

                // Ctrl+C — copy đồ đặt sàn đang chọn. Bỏ qua khi đang gõ trong ô nhập
                // (để trình duyệt copy text như thường). Nguồn id: 2D đọc multi-select set,
                // 3D đọc object đơn (selectedFurnitureIds không được 3D populate — chốt Phase 3).
                if (key === "c") {
                    if (isTypingTarget(e.target) || !engine) return;
                    const sourceIds = mode === "2d"
                        ? [...selectedFurnitureIds]
                        : (selectedObjectId ? [selectedObjectId] : []);
                    if (sourceIds.length === 0) return;
                    // getFurnitureClipboard trả null cho thứ không phải đồ đặt sàn (cửa/kệ/
                    // tường/sàn) → lọc bỏ, đồng nhất quy ước copy đơn cũ.
                    const clips = sourceIds
                        .map(id => engine.api.getFurnitureClipboard(id))
                        .filter((c): c is FurnitureClipboard => c !== null);
                    if (clips.length === 0) return;
                    e.preventDefault();
                    clipboardRef.current = clips;
                    pasteCountRef.current = 0;
                    return;
                }

                // Ctrl+V — paste cả cụm đã copy, GIỮ layout tương đối (mọi vật lệch cùng
                // một delta cascade), gói trong 1 entry undo.
                if (key === "v") {
                    if (isTypingTarget(e.target) || !engine || clipboardRef.current.length === 0) return;
                    e.preventDefault();
                    const clips = clipboardRef.current;
                    const n = (pasteCountRef.current += 1);
                    const d = PASTE_OFFSET_M * n;
                    void engine.api.asyncTransaction("paste selection", async () => {
                        for (const clip of clips) {
                            await engine.api.dispatchAsync({
                                type: "PLACE_FURNITURE",
                                modelId: clip.modelId,
                                x: clip.x + d,
                                z: clip.z + d,
                                rotY: clip.rotY,
                                y: clip.y,
                                materials: clip.materials,
                            });
                        }
                    });
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
