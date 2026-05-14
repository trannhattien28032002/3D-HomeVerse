✅ Verified. Status bar shows Plan 2D · 3 nodes · 2 walls · 100% with walls rendered and dimension annotations working. The engine context pipeline is live end-to-end.

Summary
What was changed (6 files)
File	Change
EngineContext.tsx (new)	EngineContext, useEngine() (throws), useEngineOrNull() (null-safe with window.gameEngine fallback)
Canvas.tsx	Added onEngineCreated?: (engine) => void prop; fires immediately after createEngine()
SceneView3D.tsx	Passes onEngineCreated through to Canvas
EditorPage.tsx	Holds engine in useState(null), provides it via <EngineContext.Provider value={engine}>, passes onEngineCreated={setEngine} to SceneView3D
PlanView2D.tsx	Calls useEngineOrNull(); nextNodeId() and nextWallId() prefer context engine, fall back to window.gameEngine. Module-level dispatch() is unchanged.
useFloorPlanStore.ts	Calls useEngineOrNull(); useEffect depends on [engine] so it re-subscribes when engine becomes available via context
What was NOT changed
engine.ts — still assigns window.gameEngine = engineInstance
All engine internals — zero modifications
The module-level dispatch() in PlanView2D.tsx — still uses window.gameEngine safely
Risks
Risk	Severity	Mitigation
useEffect([engine]) fires twice if engine identity changes (e.g. hot-reload creates a new instance)	Low	Effect cleanup unsubscribes the old handler before re-subscribing. EngineEvents.on() returns the unsubscribe function — already used as cleanup.
useState initializer in useFloorPlanStore reads window.gameEngine (null at first render)	None	Expected — the effect syncs the snapshot immediately after engine is available
useEngineOrNull() returns the previous engine if window.gameEngine is stale during HMR	Low	Only relevant during development. Production has a single engine lifecycle.
What remains before removing window.gameEngine entirely
PlanView2D.tsx module-level dispatch() — currently reads window.gameEngine directly. Must be moved inside the component or refactored to accept an engine parameter.
useFloorPlanStore.ts useState initializer — currently falls back to window.gameEngine for the first render. Change to useState(null) and let the [engine] effect handle the first sync.
useUIStore.ts — does not access the engine, safe already.
Any future components — must import useEngineOrNull() or useEngine() rather than window.gameEngine. The EngineContext is now the canonical access path.
Delete window.gameEngine = engineInstance from engine.ts and remove the Window interface augmentation from engineTypes.ts.