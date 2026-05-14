import { createContext, useContext } from "react";
import type { EngineInstance } from "src/engine/engineTypes";

/**
 * React context that holds the active EngineInstance.
 * Provided by EditorPage via Canvas's onEngineCreated callback.
 * Value is null until the engine has been created (after first render).
 */
export const EngineContext = createContext<EngineInstance | null>(null);

/**
 * Returns the engine from context, falling back to window.gameEngine
 * for backward compatibility during migration.
 *
 * Use this in components that may render before the engine is ready
 * (e.g. PlanView2D, useFloorPlanStore). Returns null if neither is available.
 */
export function useEngineOrNull(): EngineInstance | null {
    const ctx = useContext(EngineContext);
    return ctx ?? window.gameEngine ?? null;
}

/**
 * Returns the engine from context, falling back to window.gameEngine.
 * Throws if neither is available — use only in components that are guaranteed
 * to render after engine initialization.
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
