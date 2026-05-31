Synchronization Model Review

Core Mechanism

The engine and UI are kept in sync through a one-way event bridge:

ECS mutations (synchronous)
  → WallGeometrySystem rebuilds meshes
  → SnapshotSystem hashes all state → emits "snapshot" if changed
  → EngineEvents pub/sub delivers to React
  → useFloorPlanStore converts world→pixel coords
  → PlanView2D re-renders via Konva

React is always 1–2 frames behind the engine — imperceptible at 60fps, and never torn because all commands are synchronous.

---
Engine → UI Path

┌──────────────────┬──────────────────────────────┬─────────────────────────────────────────────────────┐
│       Step       │             File             │                      Mechanism                      │
├──────────────────┼──────────────────────────────┼────────────────────────┤
│ State change     │ dispatcher.ts                │ Synchronous ECS mutation                            │
├──────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────┤
│ Geometry rebuild │ WallGeometrySystem.ts        │ Next frame, systems pipeline                        │
├──────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────┤
│ Hash diff        │ SnapshotSystem.ts:57–79      │ String                 │
├──────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────┤
│ Event emit       │ EngineEvents.ts:126          │ events.es lastSnapshot │
├──────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────┤
│ React update     │ useFloorPlanStore.ts:177–181 │ on("sna                │
├──────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────┤
│ Pixel conversion │ useFloorPlanStore.ts:184–195 │ useMemo([snap, vpW, vpH])                           │
├──────────────────┼──────────────────────────────┼────────────────────────┤
│ Canvas render    │ PlanView2D.tsx               │ Konva re-renders layers                             │
└──────────────────┴──────────────────────────────┴─────────────────────────────────────────────────────┘

---
UI → Engine Path

User gesture (click/drag)
  → Tool.onStageClick / onDragMove
  → dispatch(EngineCommand)          ← fully synchronous
  → ECS mutations (NodeRegistry, World, MeshRegistry)
  → (returns immediately)
  → next RAF frame picks up changes

Tools receive state via ToolContext — a fresh snapshot pushed on every render:

// PlanView2D.tsx:158-166 — every render
activeTool.update({
    nodes, walls,          // fresh from useFloorPlanStore
    dispatch, withTransaction,
    selectedWallIds, ...
});

If a tool needs updated state mid-interaction before the next snapshot arrives, it calls requestUpdate() which increments a seed counter, forcing PlanView2D to re-render and push a fresh context.

---
Snapshot Hash Coverage

Hashed (triggers UI update):
- Wall ID, endpoints, thickness, height, center, polygon points
- Node positions (4 decimal precision)
- Cap polygons at junction nodes
- Dimension lengths and angle arcs

Not hashed (intentionally ignored):
- Material/color assignments — not floor plan data
- Draggable, Selectable component flags — renderer hints only
- Camera position / orbit state — separate subsystem

One finding: The hash string is built as wallHash + "##" + imensions are appended to the snapshot after hash computation (SnapshotSystem.ts:92). However this is harmless: dimensions are derived from node positions, so any change that affects dimensions already changes
the node hash.

---
Undo/Redo Sync

Ctrl+Z
  → engine.api.undo()
  → deserializeScene(snapshot, engine):
      dispatch REMOVE_WALL × all walls
      dispatch ENSURE_NODE × all nodes
      dispatch ADD_WALL × all walls
  → next frame: WallGeometrySystem + SnapshotSystem run
  → snapshot emitted → UI updates
  → PlanView2D clears selectedWallIds + calls tool.onCancel

The restoration goes through the dispatcher — same validati, same side effects as a live edit.

---
Lifecycle Sync

Engine creation is synchronous inside a useEffect([], []). The mount/unmount sequence is clean:

Canvas mounts → createEngine() → onEngineCreated(engine) → setEngine(engine)
  → EngineContext.Provider updates → useFloorPlanStore subs
Canvas unmounts → engine.dispose() → loop stops, meshes freed, window.gameEngine cleared
  → useFloorPlanStore useEffect cleanup → unsubscribes from

---
Issues Found

Minor risks:

1. Stale ToolContext between snapshot arrivals — tools cache this.ctx on each update() call; if multiple dispatches fire before the next snapshot lands (e.g., rapid clicks), this.ctx.nodes may not reflect the latest dispatch. Mitigated by requestUpdate() but requires tool authors to know when
to call it — no enforcement.
2. window.gameEngine global lingers after context switch — engine.dispose() deletes it, but if EngineContext is replaced before dispose, the global
points to the old engine. useEngineOrNull() prefers contextcode that reaches for window.gameEngine directly would hitstale state.
3. No snapshot emission during deserializeScene intermediatying N remove+add commands, the hash changes on everydispatch but SnapshotSystem only runs at the end of the frame. This is actually correct behavior but means the 2D view won't show partial undo state — it will jump directly to the final restored state. Fine in practice, but worth knowing.
4. requestUpdate() is a manual contract — tool authors mustperative state changes. No lint rule or type systemenforcement exists; a future tool that forgets will silently show stale data.

---
What's Solid

- No race conditions — single RAF loop, synchronous dispatch, snapshot always captures complete post-mutation state
- Consistent 2D/3D — both views read the same ECS; they canons
- Proper cleanup — event subscriptions, RAF, Three.js resources all freed on unmount
- Hash dedup — prevents Konva re-renders on unchanged frame driving a React tree)
- lastSnapshot cache — late subscribers (hot reload, remount) get current state immediately without waiting for the next mutation