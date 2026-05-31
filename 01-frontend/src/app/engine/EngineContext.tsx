/**
 * EngineContext — React context chia sẻ EngineInstance xuống toàn bộ component tree.
 *
 * Lifecycle:
 *   1. EditorPage render → Canvas mount → createEngine(canvas) → onEngineCreated(engine)
 *   2. EditorPage.setEngine(engine) → EngineContext.Provider value = engine
 *   3. Tất cả child component gọi useEngineOrNull() để nhận engine
 *
 * Tại sao value ban đầu là null:
 *   Engine được tạo trong useEffect của Canvas (sau render đầu tiên).
 *   Các component như PlanView2D cần render trước khi engine ready → phải handle null.
 *
 * window.gameEngine: backward-compat + debug via DevTools.
 *   useEngineOrNull() fallback về đây nếu context chưa có engine.
 */
import { createContext, useContext } from "react";
import type { EngineInstance } from "src/engine/engineTypes";

export const EngineContext = createContext<EngineInstance | null>(null);

/**
 * Hook an toàn — trả về null nếu engine chưa sẵn sàng.
 * Dùng trong component có thể render trước engine (PlanView2D, useFloorPlanStore).
 */
export function useEngineOrNull(): EngineInstance | null {
    const ctx = useContext(EngineContext);
    return ctx ?? window.gameEngine ?? null;
}

/**
 * Hook strict — throw nếu không tìm thấy engine.
 * Chỉ dùng trong component CHẮC CHẮN render sau khi engine đã khởi tạo.
 */
export function useEngine(): EngineInstance {
    const engine = useEngineOrNull();
    if (!engine) {
        throw new Error(
            "useEngine(): No engine found. " +
            "Ensure this component is rendered inside <EngineContext.Provider>."
        );
    }
    return engine;
}
