# HomeVerse 3D Editor — Architectural Analysis & Staged Migration Plan

> **Scope:** Analysis only — no implementation. Based on full codebase inspection (May 2026).  
> **Approach:** Incremental. Preserves current functionality at every stage.

---

## Part 1 — Confirmed vs Speculative Findings

### ✅ CONFIRMED (verified in code)

| Finding | Location | Evidence |
|---|---|---|
| **R1 — `window.gameEngine` global singleton** | `engine.ts:98`, `engineTypes.ts:27-29`, `Canvas.tsx:14` | `window.gameEngine = engineInstance` is the only reference point. `PlanView2D.tsx` and `useFloorPlanStore.ts` both access it directly. |
| **R3 — Full snapshot rebuild every dirty frame** | `SnapshotSystem.ts:57-93` | String-concatenates _all_ wall/node/cap hashes every frame. `useFloorPlanStore.ts:176-187` runs `useMemo([snap])` which maps over every entity on every reference change. |
| **C1 — UI imports directly from `src/engine`** | `PlanView2D.tsx:6` | `import type { EngineCommand } from "src/engine/commands/EngineCommands"` — the UI module reaches into the engine internals. |
| **C4 — `PX_PER_WORLD = 100` duplicated** | `useFloorPlanStore.ts:4`, `PlanView2D.tsx:14` | Both declare it independently as a literal constant. Nothing enforces they stay in sync. |
| **S3 — RoomSystem uses string-concat hash** | `RoomSystem.ts:32-38` | Iterates every node and concatenates position + connectedWallIds strings on every `update()` call, even when nothing changed. |
| **P1 — Mesh ownership scattered** | `WallFactory.ts:51-57`, `WallGeometrySystem.ts:391-398`, `RoomSystem.ts:96-101` | WallFactory creates the initial mesh. WallGeometrySystem replaces its geometry AND owns cap meshes. RoomSystem owns floor meshes. Three distinct ownership patterns with no central registry. |
| **P2 — Materials created inline, not pooled** | `WallFactory.ts:52`, `WallGeometrySystem.ts:391`, `RoomSystem.ts:18-23` | Every wall, every cap, the floor plane — each allocates its own `THREE.MeshStandardMaterial`. |
| **P3 — Render loop runs every frame unconditionally** | `engine.ts:50-58`, `RenderSystem.ts` | `requestAnimationFrame(loop)` calls `world.update(dt)` regardless of scene dirtiness. |
| **P4 — HDRI loader has no error handler** | `sceneSetup.ts:40-47` | `new EXRLoader().load("/studio.exr", onSuccess)` — no `onError` callback. Silent failure in production. |
| **M3 — Commands are not transactional** | `PlanView2D.tsx:446-447` | `dispatch(ADD_WALL)` followed immediately by `dispatch(RESOLVE_INTERSECTIONS)` — two separate mutations with no grouping boundary. |
| **M4 — Direct in-place mutation** | `dispatcher.ts:156-157, 278-280` | `wn.startNodeId = targetNodeId`, `wn.thickness = command.thickness` — component fields mutated directly. |
| **Sy4 — vpW/vpH baked into world→canvas conversion** | `useFloorPlanStore.ts:157-187` | `ox = vpW / 2, oy = vpH / 2` used inside `nodeToPx`, `wallToPx`, etc. Same node gets a different pixel coordinate depending on viewport size. |
| **M2 — PlanView2D is an 800-line god component** | `PlanView2D.tsx:1-800` | All draw logic, snap logic, pan/zoom, keyboard shortcuts, selection, drag-and-drop, and all rendering layers live in one function component. |
| **engineBridge.ts is fully commented-out** | `app/engine/engineBridge.ts` | The proper DI layer exists as dead code — the singleton pattern was chosen as a shortcut and the bridge was never activated. |
| **useEditorStore.ts is fully commented-out** | `app/store/useEditorStore.ts` | Selection state is entirely absent from shared state. It lives only in `PlanView2D.tsx` local state. |

### ⚠️ SPECULATIVE (flagged in review — not yet stressing the codebase)

| Finding | Status | Assessment |
|---|---|---|
| **S1 — O(N) snap scan on mousemove** | Theoretical at current scale | Confirmed: `snapToNodeOrGrid` iterates all nodes then all walls on every `onMouseMove`. Will matter at ~1000+ nodes. Not a problem today. |
| **S2 — WallGeometrySystem full graph re-eval on any move** | Partially mitigated | The `nodeCache` with hash comparison partially addresses this. A dirty-set would be cleaner but the cache makes this less urgent. |
| **S4 — Snapshot history for undo/redo** | Not built yet | No undo system exists. The concern is valid but there is nothing to fix yet. |
| **C5 — sceneSetup mixes camera, scene, renderer** | Low urgency | Confirmed but harmless at current scale. Splitting has value primarily for testability and future VR/AR adaptation. |
| **Sy1/Sy2 — No version vector on snapshots** | Relevant only for collaboration | Not needed until a backend sync layer is added. |
| **C3 — Konva-specific types in useFloorPlanStore** | Real but contained | The `Node2D`, `Wall2D` etc. types are pixel-space but clearly documented. Only matters if a second view is added (minimap, paper export). |

---

## Part 2 — Highest-Risk Architectural Seams

These are ordered by **blast radius** — the number of roadmap items blocked by each seam.

### Seam 1 — `window.gameEngine` singleton (blocks: multi-floor, SSR, testing, collaborative editing)
**Risk:** Every new feature that needs to touch the engine reaches through `window`. This is currently in 4 places (`Canvas.tsx`, `PlanView2D.tsx`, `useFloorPlanStore.ts`, and implicitly `useUIStore.ts` via wallId counter). It will be in 40 places by the time objects, materials, and multi-floor land if not addressed.

### Seam 2 — No transactional dispatch + no undo (blocks: undo/redo, all multi-step operations)
**Risk:** `ADD_WALL → RESOLVE_INTERSECTIONS` is already one logical user action split into two commands. As complexity grows (add door → resize opening → update structural analysis), the number of implicit "must happen together" command pairs will multiply. Retrofitting transactions is far harder after the fact.

### Seam 3 — PlanView2D monolith (blocks: new tools, vertex edit mode, measurement tool, multi-select lasso)
**Risk:** The 800-line god component makes it impossible to add a new interaction mode without introducing state-sharing bugs. Every new tool currently adds more `if (toolMode === "X")` branches into one giant component. This is already visible: the `drawState` and `selectedWallIds` and `wallDragOrigin` are three independent state machines coexisting in the same component.

### Seam 4 — No serialization layer (blocks: save/load, persistence, project management)
**Risk:** The `defaultScene.ts` puts the initial world state in code. There is no mechanism to save the current scene to a file or to the backend. This is the most visible missing feature for users. The entire ECS state needs to be serializable before any persistence feature ships.

### Seam 5 — Scattered mesh ownership (blocks: doors, windows, furniture, memory safety at scale)
**Risk:** Three ownership patterns already exist. Adding a door system, a furniture system, or a material library would each add another. Without a `MeshRegistry`, memory leaks are only a matter of time — a mesh drops out of one system's tracking and `scene.traverse` on dispose misses it.

---

## Part 3 — Priority Matrix

| Issue | Urgency | Future Impact | Impl. Difficulty | Refactor Risk | Score |
|---|---|---|---|---|---|
| **[S2] No serialization** | 🔴 Critical | 🔴 High | 🟡 Medium | 🟢 Low | **1** |
| **[S1] Transactional dispatch / undo foundation** | 🔴 Critical | 🔴 High | 🟡 Medium | 🟡 Medium | **2** |
| **[S3] PlanView2D decomposition → Tool abstraction** | 🟡 High | 🔴 High | 🟡 Medium | 🟡 Medium | **3** |
| **[S4] `window.gameEngine` → EngineContext** | 🟡 High | 🔴 High | 🟢 Low | 🟢 Low | **4** |
| **[S5] MeshRegistry + MaterialRegistry** | 🟡 High | 🟡 Medium | 🟡 Medium | 🟡 Medium | **5** |
| **[P3] Damage-driven render loop** | 🟢 Medium | 🟡 Medium | 🟢 Low | 🟢 Low | **6** |
| **[S3] RoomSystem O(N) hash → dirty counter** | 🟢 Medium | 🟡 Medium | 🟢 Low | 🟢 Low | **7** |
| **[C4] PX_PER_WORLD deduplication** | 🟢 Low | 🟢 Low | 🟢 Very Low | 🟢 Low | **8** |
| **[Sy4] Viewport origin in store → Stage transform** | 🟢 Low | 🟡 Medium | 🟡 Medium | 🟡 Medium | **9** |
| **[P4] HDRI error handling** | 🟢 Low | 🟢 Low | 🟢 Very Low | 🟢 Low | **10** |

---

## Part 4 — Staged Migration Plan

---

### Stage 0 — Zero-Friction Fixes *(do anytime, no risk)*

**Goal:** Eliminate confirmed bugs and duplicate constants with no architectural impact.

**Why it matters:** These are paper cuts that compound. `PX_PER_WORLD` desync and missing HDRI error handling will cause invisible bugs that are hard to trace. Fix them first to stabilize the baseline.

**Affected files:**
- `src/app/constants/` — new file: `viewConstants.ts` (single `PX_PER_WORLD` export)
- `src/app/store/useFloorPlanStore.ts` — import constant
- `src/app/components/editor/PlanView2D.tsx` — import constant
- `src/engine/setup/sceneSetup.ts` — add `onError` callback to EXRLoader

**Migration strategy:**
1. Create `src/app/constants/viewConstants.ts` → export `PX_PER_WORLD = 100`
2. Replace both local declarations with the import
3. Add `onError: (err) => console.error("[sceneSetup] HDRI load failed:", err)` to `EXRLoader.load()`
4. Verify 2D view still renders correctly after constant change

**Expected payoff:** Eliminates silent HDRI failures. Ensures PX constants stay synchronized when scale changes.

**Risks:** None — pure constant extraction.

**Complexity:** ⭐ Trivial (1–2 hours)

**Unlocks:** Nothing specific, but removes noise from future debugging.

---

### Stage 1 — Engine Context (Dependency Injection) *(replaces `window.gameEngine`)*

**Goal:** Expose the engine instance via a typed React context instead of `window.gameEngine`. The singleton itself is not removed — only its access mechanism changes.

**Why it matters:** 
- The `window.gameEngine` pattern will proliferate. Every new component that needs the engine will reach through `window`. 
- The commented-out `engineBridge.ts` proves this was the intended design — it just stalled.
- This is the cheapest structural change with the highest long-term leverage.

**Affected files:**
- `src/app/engine/engineBridge.ts` — uncomment and adapt as a React Context
- `src/app/components/editor/Canvas.tsx` — emit engine instance via context after creation
- `src/app/pages/EditorPage.tsx` — provide context
- `src/app/components/editor/PlanView2D.tsx` — replace `window.gameEngine` usages with `useEngine()` hook
- `src/app/store/useFloorPlanStore.ts` — accept engine as parameter or consume context

**Migration strategy (incremental — 3 steps):**
1. Create `src/app/engine/EngineContext.tsx`: a `React.createContext<EngineInstance | null>(null)` and a `useEngine()` hook that throws if context is null.
2. In `Canvas.tsx`: after `createEngine(canvas)`, store the instance in a React state and provide it via `<EngineContext.Provider>`. Keep `window.gameEngine = engine` assignment in place for now (backwards compatibility).
3. Update `PlanView2D.tsx` and `useFloorPlanStore.ts` to call `useEngine()` instead of `window.gameEngine`. Remove `window.gameEngine` assignment only after all consumers are migrated.

**Tradeoffs:**
- Keeping `window.gameEngine` temporarily means no breakage during migration.
- The context approach does not help server-side rendering (Canvas is client-only), but it removes the global-state coupling and enables testing with mock engines.

**Risks:** Low. The engine API shape (`EngineApi`) doesn't change. Only the access path changes.

**Complexity:** ⭐⭐ Simple (half-day)

**Unlocks:** Multi-floor (each floor could be its own context zone), testing with mocks, embedded previews.

---

### Stage 2 — Serialization Layer *(save/load — most user-visible gap)*

**Goal:** Define a `SceneDocument` type that captures the full ECS state as plain JSON, and implement `serializeScene()` / `deserializeScene()` functions that round-trip through the `NodeRegistry` and `dispatcher`.

**Why it matters:** Without this, the app has no persistence. It is the single biggest missing feature from a user's perspective, and every roadmap item (projects page, cloud sync, file import/export) depends on it.

**Affected files:**
- `src/engine/serialization/` — new directory
  - `SceneDocument.ts` — type definitions
  - `serialize.ts` — reads `NodeRegistry` + ECS world, produces `SceneDocument`
  - `deserialize.ts` — takes `SceneDocument`, dispatches commands to rebuild state
- `src/engine/graph/NodeRegistry.ts` — already has `snapshot()` method — extend to be serialization-ready
- `src/app/pages/EditorPage.tsx` — wire save/load buttons

**Data shape (minimal):**
```typescript
type SceneDocument = {
  version: 1;
  nodes: { id: number; x: number; z: number }[];
  walls: { wallId: number; startNodeId: number; endNodeId: number; thickness: number; height: number }[];
};
```

**Migration strategy:**
1. Define `SceneDocument` type — freeze `version: 1` now to allow future migrations.
2. `serialize()`: read `NodeRegistry.snapshot()` for nodes; iterate `wallEntityByWallId` for walls. No new infrastructure needed.
3. `deserialize()`: iterate document → dispatch `ENSURE_NODE` for each node, `ADD_WALL` for each wall. This reuses existing dispatcher logic exactly.
4. Wire `Save` button: `JSON.stringify(serialize(...))` → `localStorage` or file download.
5. Wire `Load` button: parse JSON → validate version → `deserialize(...)`.

**Tradeoffs:**
- Using dispatcher to deserialize means all validation runs through the same paths as normal editing.
- The downside is O(N) individual dispatches on load instead of a bulk operation. For files up to ~5000 walls this is imperceptible. A bulk load path can be added later.
- File format is locked at `version: 1`. Plan migration functions from day one.

**Risks:** Medium. Deserialization relies on dispatcher correctness. Test with edge cases (isolated nodes, multi-wall junctions, intersecting walls).

**Complexity:** ⭐⭐⭐ Moderate (1–2 days for core; add 1 day for UI wiring and validation)

**Unlocks:** Projects page, cloud sync, file import/export, undo/redo (command log is easier to build once you have a serialize baseline to verify against).

---

### Stage 3 — Transactional Dispatch + Undo Foundation

**Goal:** Introduce a `transaction()` wrapper around the dispatcher so that multi-command user actions become a single undo entry. Simultaneously introduce an immutable component update pattern to make "previous value" tracking possible.

**Why it matters:** 
- The review flags undo/redo as **Critical — must fix before more features**. Currently `ADD_WALL + RESOLVE_INTERSECTIONS` is two commands but one user action. As features grow, this problem compounds.
- Retrofitting transactions after undo/redo is built is significantly more painful than building the boundary now.

**Affected files:**
- `src/engine/commands/dispatcher.ts` — wrap with transaction support
- `src/engine/commands/EngineCommands.ts` — unchanged (command shapes remain the same)
- `src/app/components/editor/PlanView2D.tsx` — wrap paired dispatches in `transaction()`

**Phase 3a — Transaction wrapper (no undo yet):**
```typescript
// In dispatcher, add:
let currentTransaction: EngineCommand[] | null = null;

function transaction(label: string, fn: () => void): void {
    currentTransaction = [];
    fn();
    const cmds = currentTransaction;
    currentTransaction = null;
    // For now: just execute. In Phase 3b, record cmds as one undo entry.
    console.debug(`[transaction] "${label}" — ${cmds.length} commands`);
}
```
This is a pure addition. All existing `dispatch()` calls continue to work. The `transaction()` wrapper is used for new paired dispatches.

**Phase 3b — Command log (prerequisite for undo):**
- Each command already has a well-defined shape. Define inverse for each:
  - `ADD_WALL(id, s, e)` → inverse: `REMOVE_WALL(id)`
  - `REMOVE_WALL(id)` → inverse: `ADD_WALL(id, s, e, thickness)` — requires recording pre-removal data
  - `MOVE_NODE(id, x, z)` → inverse: `MOVE_NODE(id, prevX, prevZ)` — requires recording previous position
  - `RESOLVE_INTERSECTIONS` → **no direct inverse** — must be captured as a batch of SPLIT_WALLs inside a transaction
- Store a `commandLog: Transaction[]` in engine state. `undo()` walks the log backwards and dispatches inverses.

**Tradeoffs:**
- `RESOLVE_INTERSECTIONS` is the hard case. Its side effects (creating nodes, splitting walls) must be recorded at the transaction level so they can be inverted as a group.
- Immutable component updates (`world.replaceComponent(entity, new WallNodes(...))`) make "record previous value" trivial. This is a safe mechanical change: replace in-place mutations in the dispatcher with replace calls. The ECS world's `addComponent` / `removeComponent` already exists; `replaceComponent` just needs to be added as a convenience wrapper.

**Risks:** Medium. The dispatcher is the highest-traffic code path. Each change must be tested against the full set of interaction scenarios (draw, merge, split, move, resolve intersections).

**Complexity:** ⭐⭐⭐ Phase 3a (1 day). ⭐⭐⭐⭐ Phase 3b (3–5 days, careful).

**Unlocks:** Undo/redo (the most-requested editor feature), collaborative diffing, command replay for debugging.

---

### Stage 4 — PlanView2D Decomposition → Tool Pattern

**Goal:** Extract the interaction logic from `PlanView2D.tsx` into discrete Tool classes. `PlanView2D` becomes a host that mounts the active tool and delegates pointer events.

**Why it matters:** The 800-line god component is the single biggest barrier to adding new tools. Every new interaction mode (vertex edit, lasso select, measurement tape, room labeling) currently has no clean insertion point. The `toolMode` branches already show the strain — the component is effectively a multi-mode state machine encoded as if/else chains.

**Affected files:**
- `src/app/components/editor/tools/` — new directory
  - `ToolBase.ts` — interface: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onCancel`, `renderOverlay()`
  - `DrawWallTool.ts` — extracted from PlanView2D draw-mode logic
  - `SelectTool.ts` — extracted from select-mode logic (selection, drag-wall, drag-handle)
- `src/app/components/editor/PlanView2D.tsx` — reduce to: state that is cross-tool (stageScale, stagePos, nodes, walls from store), tool registration, event delegation, and static layers (rooms, dimensions, angles)

**Migration strategy (strictly incremental):**
1. **Do not rewrite** — extract one tool at a time.
2. Step 1: Define `ToolBase` interface. Add a `currentTool` ref to PlanView2D. No behavioral change yet.
3. Step 2: Move `DrawWallTool` logic into its class. The class receives `dispatch`, `nodes`, `walls`, `originX/Y` as constructor deps. Test draw mode thoroughly.
4. Step 3: Move `SelectTool` logic similarly.
5. Step 4: Tool's `renderOverlay()` returns a Konva `Layer` (or null). PlanView2D renders it as a slot.
6. Step 5: Selection state moves out of PlanView2D local state and into the active tool instance (later: into a shared EditorStore so 3D view can also react).

**Tradeoffs:**
- The tool pattern requires a stable interface contract. If the interface is too narrow, tools will reach back into the host. Define the interface generously (access to nodes, walls, dispatch, snap functions, stageScale).
- React and imperative classes are awkward. Tools should be plain classes (not React components) that emit events upward. The host re-renders; tools hold input state in refs, not React state.

**Risks:** Medium-High. This is the largest single refactor. Doing it incrementally (one tool at a time) keeps the risk manageable, but the intermediate state has both the old and new systems coexisting.

**Complexity:** ⭐⭐⭐⭐ (3–5 days spread across 2–3 sessions)

**Unlocks:** Measurement tool, vertex edit mode, lasso select, room labeling, snap preview overlays — all these tools can be added without touching the host component.

---

### Stage 5 — MeshRegistry + MaterialRegistry

**Goal:** Centralize all Three.js mesh and material lifecycle under two registries. Factories construct; systems update; registries own disposal.

**Why it matters:**
- Three different mesh ownership patterns currently exist (WallFactory → mesh, WallGeometrySystem → cap meshes, RoomSystem → floor meshes). Adding doors, windows, and furniture adds more.
- The `scene.traverse()` disposal in `engine.dispose()` is a fallback — it doesn't catch meshes that were removed from the scene but not properly disposed.
- The material library roadmap item is completely blocked until a `MaterialRegistry` exists.

**Affected files:**
- `src/engine/rendering/` — new directory
  - `MeshRegistry.ts` — `register(entityId, mesh, geometry, material)`, `dispose(entityId)`, `disposeAll()`
  - `MaterialRegistry.ts` — `get(signature): THREE.Material`, `releaseAll()`
- `src/engine/game/WallFactory.ts` — register created mesh with `MeshRegistry`
- `src/engine/systems/WallGeometrySystem.ts` — register cap meshes; replace inline material allocation with `MaterialRegistry.get()`
- `src/engine/systems/RoomSystem.ts` — register floor meshes
- `src/engine/engine.ts` — call `meshRegistry.disposeAll()` and `materialRegistry.releaseAll()` in `dispose()`

**Migration strategy:**
1. Create `MeshRegistry` with `register / dispose / disposeAll`. Initially: a thin wrapper over a `Map<entityId, {mesh, geometry, material}>`.
2. Update `WallFactory` to register on creation. Test disposal path.
3. Update `WallGeometrySystem` cap mesh creation to use `MeshRegistry`.
4. Update `RoomSystem` floor mesh creation to use `MeshRegistry`.
5. Create `MaterialRegistry` (keyed by `{color, metalness, roughness}`). Migrate `WallFactory` to use it first — smallest surface area.
6. Migrate `WallGeometrySystem` cap material to shared instance.
7. Remove `scene.traverse` from `engine.dispose()` once all meshes are registered.

**Tradeoffs:**
- `MaterialRegistry` with reference counting is more correct than simple sharing (prevents disposing a material still in use). For the current single-user case, simple sharing (never dispose until `disposeAll`) is sufficient.
- The registry pattern adds one hop between "create mesh" and "track mesh", but it makes memory management auditable — you can log all registered meshes and verify nothing was missed.

**Risks:** Medium. The disposal path is the highest-risk part. Incorrect disposal causes Three.js WebGL errors. Test by cycling the scene multiple times (create walls → destroy all → create again).

**Complexity:** ⭐⭐⭐ MeshRegistry (1 day). ⭐⭐⭐ MaterialRegistry (1 day).

**Unlocks:** Material library, texture cache, object library (furniture), memory safety at 1000+ mesh scale.

---

## Part 5 — Sequencing Summary

```
NOW ──────────────────────────────────────────────────────────► ROADMAP
  
  Stage 0       Stage 1         Stage 2        Stage 3        Stage 4       Stage 5
  ─────────     ───────         ───────        ───────        ───────       ───────
  Constants     Engine          Serialization  Transaction    Tool          Mesh +
  + HDRI fix    Context DI      Save/Load      + Undo         Pattern       Material
                                               Foundation                   Registry
  
  ½ day         ½ day           2–3 days       5–7 days       3–5 days      2–3 days
  Zero risk     Low risk        Med risk        Med-High       Med-High      Med risk
  
  Unblocks →    Testing,        Projects,       Undo/redo,     New tools,    Object lib,
                multi-floor     Cloud sync      Collab diff    Vertex edit   Mat library
```

**Total conservative estimate:** ~14–19 engineering days spread across weeks.

---

## Part 6 — Items Intentionally Deferred

| Item | Reason for Deferral |
|---|---|
| **S1 — O(N) snap spatial index** | Only relevant at >1000 nodes. Current ceiling is ~100. Add `NodeRegistry.spatialQuery()` when profiler shows real slowdown. |
| **Sy4 — Viewport origin in store → Stage transform** | Real architectural ugliness but no user-visible bug. Deferred until a second view (minimap, paper export) makes it a requirement. |
| **Sy1/Sy2 — Version vectors / CRDT** | Irrelevant until a real-time collaboration backend is scoped. |
| **C5 — sceneSetup decomposition** | Low value / effort ratio today. Revisit when VR/AR is on the immediate roadmap. |
| **R2 — R3F vs imperative decision** | Confirm the codebase is fully imperative (no R3F runtime dependency), then remove R3F from documentation only. Migrating the 3D engine to R3F is a major architectural pivot, not an incremental fix. |

---

## Closing Assessment

The architecture is structurally sound and the ECS pattern is the right fit for procedural geometry. The issues identified are growth pains, not design failures.

The specific load-bearing seams to address before the second floor goes on, in order:

1. **Serialization** — users need to save their work.
2. **Transaction boundary** — undo/redo is the next most critical user feature, and transactions are its prerequisite.
3. **Engine context** — cheap insurance against the singleton pattern proliferating.
4. **Tool pattern** — PlanView2D will be the codebase bottleneck for every new interaction feature.
5. **Mesh/Material registry** — mandatory before the object and material library ships.

Build these deliberately. None of them require large rewrites. All of them can be introduced incrementally alongside active feature development.
