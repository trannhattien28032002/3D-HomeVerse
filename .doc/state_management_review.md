State Management Review

Architecture: Three-Layer Hybrid

LAYER 1 — React UI
  EditorPage       → mode, toolMode, engine ref, loading progress (useState)
  useUIStore       → isSidebarOpen, viewportWidth/Height (Zustand)
  PlanView2D       → selectedWallIds, stageScale, stagePos (useState)
  DrawWallTool     → drawState, mousePos (imperative class state)

LAYER 2 — Event Bus / Bridge
  EngineEvents     → typed pub/sub (5 event types)
  useFloorPlanStore → subscribes to "snapshot", converts world→pixel

LAYER 3 — ECS (Source of Truth)
  NodeRegistry     → canonical node positions + adjacency
  World.components → WallNodes, WallPolygon, RoomGeometry,
  System pipeline  → WallGeometry → Room → Dimension → Render → Snapshot

---
State Files

┌──────────────────────┬────────────────┬──────────────────
│         File         │      Type      │                    Role                     │
├──────────────────────┼────────────────┼──────────────────
│ useUIStore.ts        │ Zustand        │ Sidebar + viewport dimensions               │
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ useFloorPlanStore.ts │ Custom hook    │ Snapshot subscrib
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ useWallStore.ts      │ Re-export shim │ Legacy — deprecated wrapper                 │
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ EngineContext.tsx    │ React Context  │ Engine instance p
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ EngineEvents.ts      │ EventEmitter   │ Typed pub/sub bri
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ NodeRegistry.ts      │ Plain class    │ Topology source o
├──────────────────────┼────────────────┼─────────────────────────────────────────────┤
│ World.ts             │ Plain class    │ ECS container                               │
├──────────────────────┼────────────────┼──────────────────
│ history.ts           │ Plain class    │ Undo/redo snapshot stacks                   │
└──────────────────────┴────────────────┴─────────────────────────────────────────────┘

---
Data Flow (Unidirectional)

User gesture
  → Tool (DrawWallTool / SelectTool)
  → dispatch(EngineCommand)
  → ECS mutations (NodeRegistry + World)
  → Systems run each frame (WallGeometry → Room → Dimension → Snapshot)
  → EngineEvents.emit("snapshot", ECSSnapshot)
  → useFloorPlanStore receives → converts to pixel space
  → Konva canvas re-renders

---
What Works Well

- Strict unidirectional flow — nothing writes back into the engine from UI except via dispatch()
- Hash-deduped snapshots — SnapshotSystem only emits when state actually changes; avoids redundant re-renders
- Typed event bus — EngineEventMap prevents untyped string
- Derived state isolation — pixel-space conversions are fully contained in useFloorPlanStore; engine never knows about canvas coordinates
- Command pattern as the single mutation gate — undo/redo, validation, and topology enforcement all happen in one place

---
Issues Found

Stale/Legacy:
1. useWallStore.ts is a deprecated re-export shim — safe touture contributors

Coupling risks:
2. window.gameEngine global fallback — set in engine.ts; usgineContext isn't populated yet. Fragile; timing-dependent
3. NodeRegistry has no granular change tracking — any node move invalidates all systems on every frame; will degrade on large scenes

Performance:
4. SnapshotSystem fires every frame when geometry is dirty — hash dedup reduces React re-renders, but the snapshot object itself is still rebuilt each frame
5. useFloorPlanStore useMemo dependency array may rerun conontent is identical (if the snapshot object reference changes but data doesn't)

Missing state:
6. No property panel state for 3D objects — lights, props, and non-wall entities have no selection or property state wired up
7. canUndo/canRedo not reactive — the API has these methodsem; a toolbar button couldn't update without re-rendertriggers

Tool state is ephemeral:
8. DrawWallTool.drawState is not part of any snapshot — if undo fires mid-draw, the engine scene reverts but the tool still holds its old
startNodeId, causing a stale reference

---
Top Recommendations

1. Delete useWallStore.ts — it's a named re-export of useFloorPlanStore; the indirection adds noise with no benefit
2. Replace window.gameEngine with a proper initialization guard inside EngineContext — e.g., expose a useEngineReady() hook that delays rendering until context is populated
3. Add a useUndoRedo() hook that subscribes to undo/redo state changes and exposes { canUndo, canRedo, undo, redo } — the backend already supports this; it just needs a reactive wrapper
4. Cancel open transactions before applying undo — check if beginTransaction is pending in history.ts before restoring a snapshot, then cancel the tool gracefully
5. Consider snapshotting only dirty entities rather than the full scene each frame — tag entities as dirty on mutation and only reserialize those