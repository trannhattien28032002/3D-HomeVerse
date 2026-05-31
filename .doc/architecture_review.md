Architecture Review — HomeVerse Frontend

---
Layering

┌──────────────────────────────────────────────────────────────┐
│  React UI Layer (src/app/)                                   │
│  Pages / Components / Tools / Zustand Stores                 │
├──────────────────────────────────────────────────────────
│  Bridge: EngineContext + useFloorPlanStore                    │
│  (React Context DI + snapshot → pixel conversion)            │
├──────────────────────────────────────────────────────────
│  Engine Layer (src/engine/)                                  │
│  ECS World + Systems + Dispatcher + Registries               │
└──────────────────────────────────────────────────────────────┘

The separation is clean and well-maintained. The UI never w it always goes through the dispatcher. The engine nevercalls React — it emits events that the store subscribes to.

---
Data Flow (bidirectional)

UI → Engine (commands):
DrawWallTool / SelectTool
  → withTransaction() → dispatch(command)
  → dispatcher.ts switch → ECS mutations + NodeRegistry

Engine → UI (events):
SnapshotSystem (every frame, hash-guarded)
  → events.emit("snapshot", ECSSnapshot)
  → useFloorPlanStore converts world coords → px
  → Konva re-renders

This is the right pattern. The hash guard in SnapshotSystemnism — the 2D view only redraws when ECS state actuallychanges.

---
What's Solid

┌─────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│              Area               │                                                 │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ ECS core                        │ Clean, minimal, does ex                         │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ Command pattern                 │ All mutations go through dispatcher — auditable, undoable                    │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ Snapshot undo                   │ Correct approach given RESOLVE_INTERSECTIONS has no clean inverse            │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ Tool architecture               │ ToolBase + DrawWallTool, extensible             │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ MeshRegistry + MaterialRegistry │ Centralized ownership, auditable disposal                                    │
├─────────────────────────────────┼─────────────────────────────────────────────────┤
│ Serialization                   │ Version-locked, round-trips via dispatcher (same validation path as editing) │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ RoomDetection                   │ DCEL half-edge traversa                         │
├─────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ WallGeometrySystem              │ Miter + bevel calculation at junctions is the hard problem; well-implemented │
└─────────────────────────────────┴─────────────────────────────────────────────────┘

---
What's Still Load-Bearing Debt

1. window.gameEngine still present
engine.ts:157 still assigns window.gameEngine = engineInstance. EngineContext is wired in, but the global isn't removed. Two consumers of the same engine is a risk.                                                                                                                                   
2. useFloorPlanStore bakes viewport origin into pixel coordinates                                                                                   ox = vpW / 2, oy = vpH / 2 is embedded in nodeToPx / wallTo pixel position depending on the viewport. This is the Sy4finding from the arch plan — deferred but will bite if a second 2D view (minimap, print export) is ever added.                                      
3. CannonCollisionSystem runs every frame doing nothing useful
Physics world is simulated but walls are all static and no feature depends on Cannon for correctness. It's CPU overhead at 60fps. Safe to remove or gate.

4. Dead code accumulation
engineBridge.ts, useEditorStore.ts, Plan2DPage.tsx, HomePage.tsx, defaultScene.ts initDefaultScene(), LightHandle/WallEndpoints/Grounded/CameraOrbit components, useWallStore.ts — all either fully commented or unreferenced. Not dangerous but adds noise.

5. Miter geometry updates use imperative in-place mutation
In WallGeometrySystem, existing.points = newPoly and existie ECS components directly (M4 from arch plan). This isworkable but makes the undo snapshots larger than necessary since there's no "previous value" tracking.

6. No error boundary around engine initialization
If createEngine throws (canvas not available, WebGL disable the loading screen. Canvas.tsx has no try/catch.

---
Coupling Points to Watch

- PlanView2D still reads window.gameEngine through useFloorPlanStore and tool dispatch. Once window.gameEngine is removed (Stage 1 completion), this
breaks unless all consumers are migrated to useEngine().
- dispatcher.ts imports from WallFactory, MeshRegistry, MaterialRegistry — it's a moderately large dep tree for a single function. Consider whether a
 thin WallEntityManager class would be cleaner than a closu
- EditorPage is 880 lines, managing loading state, keyboard shortcuts, save/load, routing, and view switching. It's not a god component yet but
trending toward one.

---
Architecture Health Score

┌──────────────────────────────┬───────────┬───────────────────────┐
│          Dimension           │   Score   │                        Note                        │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Separation of concerns       │ ✅ Good   │ Engine / bridg        │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ State flow clarity           │ ✅ Good   │ Command down, event up — consistent                │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Memory safety                │ ✅ Good   │ MeshRegistry +        │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Extensibility (new tools)    │ ✅ Good   │ ToolBase patte        │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Extensibility (new features) │ 🟡 Medium │ window.gameEngers     │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Dead code hygiene            │ 🟡 Medium │ Several stubs         │
├──────────────────────────────┼───────────┼────────────────────────────────────────────────────┤
│ Error handling               │ 🔴 Weak   │ No error boundaries, no fallback on engine failure │
├──────────────────────────────┼───────────┼───────────────────────┤
│ Test coverage                │ 🔴 None   │ Zero automated tests at any layer                  │
└──────────────────────────────┴───────────┴────────────────────────────────────────────────────┘

The architecture is in good shape for the scope of the projd the five highest-risk seams. The remaining gaps(window.gameEngine removal, dead code cleanup, error boundaries) are lower risk but worth a housekeeping pass before the next major feature (object library, material editor, second floor).