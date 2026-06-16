<!-- refreshed: 2026-05-14 -->
# Architecture

**Analysis Date:** 2026-05-14

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│  React UI Layer  (src/app)                                          │
├──────────────────┬────────────────────┬─────────────────────────────┤
│  EditorPage      │  SceneView3D       │  PlanView2D                 │
│  `src/app/pages/ │  `src/app/         │  `src/app/components/       │
│  EditorPage.tsx` │  components/       │  editor/PlanView2D.tsx`     │
│  (mode 3d/2d)    │  editor/           │  (react-konva Stage)        │
│                  │  SceneView3D.tsx`  │                             │
└────────┬─────────┴─────────┬──────────┴──────────────┬──────────────┘
         │                   │                          │
         │ api.dispatch()    │ three.js canvas          │ hook subscribes
         │ (commands)        │ via Canvas.tsx           │ to "snapshot"
         ▼                   ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Engine Facade  `src/engine/engine.ts` → createEngine(canvas)       │
│  Exposes EngineApi on window.gameEngine                             │
│  • dispatch(EngineCommand)  • events: EngineEvents                  │
│  • setView / rotateView     • getNextIds()                          │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ECS Core  `src/engine/ecs`                                         │
│  World ← Systems[] (update each frame at requestAnimationFrame)     │
│  Entity (number id) + Components (data) + Query.entitiesWith(...)   │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────┬──────────────────────────────────────────┐
│  Systems (per frame)     │  Shared services                          │
│  `src/engine/systems/`   │  `src/engine/graph/NodeRegistry.ts`       │
│  • InputSystem           │  `src/engine/events/EngineEvents.ts`      │
│  • OrbitControlSystem    │  `src/engine/commands/dispatcher.ts`      │
│  • GizmoSystem           │                                           │
│  • PlacementAssistSystem │  3D output                                │
│  • CannonCollisionSystem │  • three.js Scene / Camera / Renderer     │
│  • LightSystem           │    built by `src/engine/setup/            │
│  • WallGeometrySystem    │    sceneSetup.ts`                         │
│  • RoomSystem            │                                           │
│  • DimensionSystem    ───┼──►  lastDimensions[],                     │
│                          │     lastAngleDimensions[]                 │
│  • RenderSystem          │                                           │
│  • SnapshotSystem     ───┼──►  events.emit("snapshot", ECSSnapshot)  │
└──────────────────────────┴──────────────────┬───────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  React store hook  `src/app/store/useFloorPlanStore.ts`             │
│  Subscribes to api.events.on("snapshot", setSnap)                   │
│  Converts world units → px (PX_PER_WORLD = 100) and shapes data     │
│  into Node2D / Wall2D / Cap2D / Room2D / Dimension2D /              │
│  AngleDimension2D, returned via useMemo.                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `App` | Root component, renders `Router` | `src/App.tsx` |
| `AppRoutes` | React Router v7 `BrowserRouter`; `/` → `EditorPage`, `/projects` → `ProjectsPage` | `src/app/routes/Routes.tsx` |
| `EditorPage` | Owns `mode: "3d" \| "2d"` and `toolMode2D: "select" \| "draw"`, mounts both viewports, listens to `tinyhome:nav` / `tinyhome:toggleMode` DOM events | `src/app/pages/EditorPage.tsx` |
| `SceneView3D` → `Canvas` | Mounts `<canvas>` and calls `createEngine(canvasRef.current)` in `useEffect`, disposes on unmount | `src/app/components/editor/SceneView3D.tsx`, `src/app/components/editor/Canvas.tsx` |
| `PlanView2D` | react-konva `Stage` with layers for rooms, walls, dimensions, angle arcs, draw preview; dispatches all mutations through `window.gameEngine.api.dispatch` | `src/app/components/editor/PlanView2D.tsx` |
| `WallPropertiesPanel` | Thickness/height inputs that dispatch `UPDATE_WALL` | `src/app/components/editor/WallPropertiesPanel.tsx` |
| `TopNavBar` / `BottomNavBar` / `BuildPanel` / `ShortcutHint` / `LoadingScreen` | Chrome and toolbars driven by `BOTTOM_NAV` config | `src/app/components/editor/*.tsx` |
| `createEngine` | Engine facade — builds scene, world, systems, dispatcher; exposes `EngineApi`; runs RAF loop calling `world.update(dt)` | `src/engine/engine.ts` |
| `World` | ECS container — `createEntity`, `addComponent`, `getComponent`, `addSystem`, `update(dt)` | `src/engine/ecs/World.ts` |
| `NodeRegistry` | Floor-plan topology source of truth: `Map<nodeId, NodeData>` with `connectedWallIds: Set<number>` and `nodeCaps` polygons | `src/engine/graph/NodeRegistry.ts` |
| `createDispatcher` | Returns `(EngineCommand) => void` switch for `ENSURE_NODE`, `MOVE_NODE`, `ADD_WALL`, `REMOVE_WALL`, `MERGE_NODE`, `SPLIT_WALL`, `UPDATE_WALL`, `RESOLVE_INTERSECTIONS` | `src/engine/commands/dispatcher.ts` |
| `EngineEvents` | Typed pub/sub (`entitySelected`, `entityAdded`, `entityRemoved`, `draggingChanged`, `snapshot`); caches `lastSnapshot` | `src/engine/events/EngineEvents.ts` |
| `WallGeometrySystem` | Computes miter/bevel joints per node, sets `WallPolygon`, rebuilds three.js `ExtrudeGeometry` for walls and node caps | `src/engine/systems/WallGeometrySystem.ts` |
| `RoomSystem` | Detects closed cycles in the wall graph via `RoomDetection.findRooms`, creates `RoomGeometry` entities and floor meshes | `src/engine/systems/RoomSystem.ts`, `src/engine/graph/RoomDetection.ts` |
| `DimensionSystem` | Computes per-wall length snapshots and per-corner angle snapshots from `NodeRegistry` + `WallNodes` each frame | `src/engine/systems/DimensionSystem.ts` |
| `SnapshotSystem` | Hashes ECS state; on change, packages `ECSSnapshot` (nodes, walls, caps, rooms, dimensions, angleDimensions) and emits `"snapshot"` | `src/engine/systems/SnapshotSystem.ts` |
| `RenderSystem` | Syncs `Transform` → `mesh.position/rotation`, then `renderer.render(scene, camera)` | `src/engine/systems/RenderSystem.ts` |
| `OrbitControlSystem` | three.js `OrbitControls` wrapper + `setView(preset)` / `rotateBy(deg)` with cubic ease-out transitions | `src/engine/systems/OrbitControlSystem.ts` |
| `GizmoSystem` | three.js `TransformControls` for translate gizmo on `Selectable` meshes | `src/engine/systems/GizmoSystem.ts` |
| `InputSystem` | Global keyboard shortcuts (`V/B/F/M/R/Tab`) fired as `window.dispatchEvent("tinyhome:nav" / "tinyhome:toggleMode")` | `src/engine/systems/InputSystem.ts` |
| `useFloorPlanStore` | React hook — subscribes to `"snapshot"`, converts world→px, returns typed 2D arrays | `src/app/store/useFloorPlanStore.ts` |
| `useUIStore` | zustand store: sidebar state, viewport size, wall-id counter | `src/app/store/useUIStore.ts` |

## Pattern Overview

**Overall:** Custom Entity-Component-System (ECS) engine wrapped in a React shell, with two parallel viewports (three.js 3D + react-konva 2D) reading from a single snapshot stream.

**Key Characteristics:**
- Engine is framework-agnostic plain TypeScript (`src/engine/`), instantiated once per `<Canvas>` mount and exposed as `window.gameEngine` (`src/engine/engine.ts` line 98).
- Unidirectional flow: UI → `api.dispatch(command)` → mutate ECS → systems run → `SnapshotSystem` emits → React hooks re-render.
- Node-driven topology — walls are derived from `WallNodes(startNodeId, endNodeId)` referencing `NodeRegistry`; moving a node automatically reshapes every connected wall.
- Per-frame RAF loop (`src/engine/engine.ts` lines 50–58) calls `world.update(dt)` which sequentially runs every registered system.
- React state for UI chrome only (mode toggle, selection set, draw state); engine owns all simulation state.
- 2D view is *not* a separate model — `useFloorPlanStore` re-projects the same `ECSSnapshot` into pixel coordinates (`PX_PER_WORLD = 100`).

## Layers

**React UI Layer:**
- Purpose: Routing, page composition, toolbars, translating user input into engine commands
- Location: `src/app/`
- Contains: `pages/`, `components/editor/`, `routes/`, `constants/`, zustand `store/`
- Depends on: `src/engine/engine.ts` (via `createEngine`), `window.gameEngine.api`, types from `src/engine/events`, `src/engine/commands`
- Used by: `src/main.tsx` → `src/App.tsx`

**Engine Facade:**
- Purpose: Single bootstrap entry that wires scene, world, systems, dispatcher; returns `EngineInstance`
- Location: `src/engine/engine.ts`, `src/engine/engineTypes.ts`
- Contains: `createEngine(canvas)`, `EngineApi`, `EngineInstance`, `Window.gameEngine` augmentation
- Depends on: `src/engine/setup/*`, `src/engine/commands/dispatcher.ts`, `src/engine/events/EngineEvents.ts`
- Used by: `src/app/components/editor/Canvas.tsx`

**ECS Core:**
- Purpose: Generic Entity / Component / System runtime
- Location: `src/engine/ecs/`
- Contains: `World`, abstract `System`, abstract `Component`, `Entity`, `Query`
- Depends on: nothing (pure TS)
- Used by: all systems, components, dispatcher

**Systems Layer:**
- Purpose: All simulation, geometry, input, rendering, snapshot logic — runs once per frame
- Location: `src/engine/systems/`
- Contains: `InputSystem`, `OrbitControlSystem`, `GizmoSystem`, `PlacementAssistSystem`, `CannonCollisionSystem`, `LightSystem`, `WallGeometrySystem`, `RoomSystem`, `DimensionSystem`, `RenderSystem`, `SnapshotSystem`
- Depends on: ECS core, components, `NodeRegistry`, three.js, cannon-es
- Used by: `src/engine/setup/systemSetup.ts` registers them in order

**Components Layer (ECS data):**
- Purpose: Pure data attached to entities
- Location: `src/engine/components/`
- Contains: `Transform`, `Mesh`, `WallTag`, `WallNodes`, `WallSize`, `WallPolygon`, `RoomGeometry`, `ColliderAABB`, `StaticBody`, `DynamicBody`, `Selectable`, `SnapToGrid`, `AutoAlign`, `Grounded`, `Draggable`, `CameraOrbit`, `AmbientLightComponent`, `DirectionalLightComponent`, `LightHandle`, `WallEndpoints`
- Depends on: `src/engine/ecs/Component.ts`
- Used by: factories in `src/engine/game/`, systems

**Game / Factories:**
- Purpose: Compose components into typed entities
- Location: `src/engine/game/`
- Contains: `WallFactory.createWall`, `GroundFactory`, `LightFactory.createAmbientLight` / `createDirectionalLight`
- Used by: `dispatcher.ts`, `engine.ts`, `defaultScene.ts`

**Topology Graph:**
- Purpose: Node-based source of truth + room detection
- Location: `src/engine/graph/`
- Contains: `NodeRegistry`, `RoomDetection.findRooms`
- Used by: dispatcher, `WallGeometrySystem`, `RoomSystem`, `DimensionSystem`, `SnapshotSystem`

## Data Flow

### Primary Request Path — Drawing a Wall in 2D

1. User clicks the `<Stage>` in draw mode (`src/app/components/editor/PlanView2D.tsx` `onClick` handler around line 399).
2. `snapToNodeOrGrid` resolves the pointer to an existing node, a wall midpoint, or the grid (`src/app/components/editor/PlanView2D.tsx` lines 56–121).
3. First click stores `drawState`; second click dispatches `ENSURE_NODE` + `ADD_WALL` + `RESOLVE_INTERSECTIONS` via `window.gameEngine.api.dispatch` (`src/app/components/editor/PlanView2D.tsx` lines 430–447).
4. `createDispatcher` switch mutates `World` + `NodeRegistry` + `wallEntityByWallId` (`src/engine/commands/dispatcher.ts` lines 51–106).
5. Next RAF tick — `world.update(dt)` runs all systems in order:
   - `WallGeometrySystem` recomputes miter polygons and rebuilds wall + cap meshes (`src/engine/systems/WallGeometrySystem.ts` `update` line 181).
   - `RoomSystem` detects new closed cycles, creates `RoomGeometry` entities and floor meshes (`src/engine/systems/RoomSystem.ts` line 31).
   - `DimensionSystem` recomputes `lastDimensions` and `lastAngleDimensions` (`src/engine/systems/DimensionSystem.ts` line 19).
   - `RenderSystem` calls `renderer.render(scene, camera)` (`src/engine/systems/RenderSystem.ts` line 26).
   - `SnapshotSystem` hashes ECS state; if changed, emits `"snapshot"` payload (`src/engine/systems/SnapshotSystem.ts` lines 29–93).
6. `useFloorPlanStore` handler `engine.api.events.on("snapshot", setSnap)` fires (`src/app/store/useFloorPlanStore.ts` line 173).
7. Hook recomputes its `useMemo` mapping (`Node2D`, `Wall2D`, `Cap2D`, `Room2D`, `Dimension2D`, `AngleDimension2D`); Konva re-renders.

### Angle Dimensions Pipeline (`DimensionSystem → SnapshotSystem → store → Konva`)

This pipeline matches the actual code exactly:

1. **`DimensionSystem.update`** queries entities with `WallTag + WallNodes` and builds a `Map<wallId, {startNodeId, endNodeId}>` (`src/engine/systems/DimensionSystem.ts` lines 19–50).
2. **`DimensionSystem.computeAngleDimensions`** iterates every node in `NodeRegistry`; for nodes with ≥2 connected walls it builds outward unit vectors, sorts by `Math.atan2`, and emits one `AngleDimensionSnapshot` per adjacent CW pair (`src/engine/systems/DimensionSystem.ts` lines 54–116):
   - Filters reflex / degenerate angles via `if (sweep < 5 || sweep > 175) continue`.
   - Computes `cornerX/Z`, `startAngle`, `sweepAngle`, normalized bisector (`bisectorX/Z`).
   - Result stored on `this.lastAngleDimensions`.
3. **`SnapshotSystem.update`** packages `dimensions: dimSystem.lastDimensions` and `angleDimensions: dimSystem.lastAngleDimensions` into `ECSSnapshot` and emits via `events.emit("snapshot", snapshot)` (`src/engine/systems/SnapshotSystem.ts` lines 92–93). System registration order in `src/engine/setup/systemSetup.ts` lines 48–52 guarantees `DimensionSystem` runs *before* `SnapshotSystem` each frame.
4. **`useFloorPlanStore.angleToPx`** projects each `AngleDimensionSnapshot` to `AngleDimension2D`: `cx/cy` in px, `startAngleDeg`, `sweepAngleDeg`, screen-space bisector, and a `"${Math.round(angle)}°"` label (`src/app/store/useFloorPlanStore.ts` lines 141–153).
5. **`PlanView2D`** renders a Konva `<Arc>` with `innerRadius={0}`, `outerRadius={arcR}`, `rotation={adim.startAngleDeg}`, `angle={adim.sweepAngleDeg}` plus a `<Text>` label positioned along the bisector (`src/app/components/editor/PlanView2D.tsx` lines 714–744); the layer is hidden below `stageScale < ANGLE_HIDE_BELOW (0.40)`.
6. **Angle snap during draw** (`applyAngleSnap`, `src/app/components/editor/PlanView2D.tsx` lines 128–176) — when a draw-mode pointer is committed and the start node has connected walls, candidate angles `[15, 30, 45, 60, 90, 120, 135, 150, 180]` are tested CW/CCW against each reference wall within `ANGLE_SNAP_THRESHOLD_DEG = 4`; the pointer is rotated about the anchor preserving its distance.

### Mode Switching / Keyboard

1. User presses `Tab` → `InputSystem` listener fires `window.dispatchEvent(new CustomEvent("tinyhome:toggleMode"))` (`src/engine/systems/InputSystem.ts` lines 66–68).
2. `EditorPage` `useEffect` subscriber flips `mode` between `"3d"` and `"2d"` (`src/app/pages/EditorPage.tsx` line 50).
3. Both viewports are mounted simultaneously; `display: "none"` toggles which one is visible — the engine keeps running in either mode.

**State Management:**
- **Engine state:** owned by `World`, `NodeRegistry`, `wallEntityByWallId Map`, three.js `Scene` — mutated only through `dispatch(EngineCommand)`.
- **Snapshot cache:** `EngineEvents.lastSnapshot` lets newly-mounted React subscribers seed from the latest frame.
- **React UI state:** `useState` inside `EditorPage` and `PlanView2D`; one zustand store (`useUIStore`) for sidebar + viewport size + wall-id counter.
- **Global handle:** `window.gameEngine` is the only cross-layer reference — UI looks up `window.gameEngine?.api.dispatch(...)`.

## Key Abstractions

**`EngineCommand`:**
- Purpose: Discriminated union of all UI→engine mutations.
- Examples: `{type: "MOVE_NODE", nodeId, x, z}`, `{type: "ADD_WALL", wallId, startNodeId, endNodeId, thickness}`, `{type: "RESOLVE_INTERSECTIONS", wallId}`.
- File: `src/engine/commands/EngineCommands.ts`
- Pattern: All side-effects flow through `createDispatcher`'s `switch (command.type)` (`src/engine/commands/dispatcher.ts` lines 26–352).

**`ECSSnapshot`:**
- Purpose: Frozen per-frame view of the world for React consumers.
- Shape: `{ nodes: NodeSnapshot[], walls: WallSnapshot[], caps: NodeCapSnapshot[], rooms: RoomSnapshot[], dimensions: DimensionSnapshot[], angleDimensions: AngleDimensionSnapshot[] }`.
- File: `src/engine/events/EngineEvents.ts`
- Pattern: Hash-then-emit — `SnapshotSystem` only emits when a stringified hash changes (`src/engine/systems/SnapshotSystem.ts` lines 77–79).

**`NodeRegistry`:**
- Purpose: Authoritative graph of floor-plan vertices with edges encoded as `connectedWallIds`.
- File: `src/engine/graph/NodeRegistry.ts`
- Pattern: Hand-rolled `Map<number, NodeData>` with monotonically increasing `nextId`; also stores precomputed `nodeCaps` polygons.

**`WallNodes` component:**
- Purpose: Wall entities never store coordinates — only `startNodeId`, `endNodeId`, `thickness`.
- File: `src/engine/components/WallNodes.ts`
- Pattern: Geometry is derived in `WallGeometrySystem` from `NodeRegistry.get(id)`.

**`EngineEvents` (typed pub/sub):**
- Purpose: Internal event bus with strongly-typed payloads (`EngineEventMap`).
- File: `src/engine/events/EngineEvents.ts`
- Pattern: `on(type, handler)` returns an unsubscribe closure; caches `lastSnapshot` for hot-mount.

## Entry Points

**`src/main.tsx`:**
- Triggers: Vite dev/build entry referenced by `index.html`.
- Responsibilities: `createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)`.

**`src/App.tsx`:**
- Triggers: Mounted by `main.tsx`.
- Responsibilities: Renders `<Router />` (= `src/app/routes/Routes.tsx`).

**`src/app/routes/Routes.tsx`:**
- Triggers: Top-level routing via `react-router-dom` v7 `BrowserRouter`.
- Responsibilities: `/` → `EditorPage`, `/projects` → `ProjectsPage` (HomePage route is commented out; `/projects/:id` is reserved).

**`createEngine(canvas)`:**
- Location: `src/engine/engine.ts`
- Triggers: `Canvas.tsx` `useEffect` on mount.
- Responsibilities: Build `Scene`/`Camera`/`Renderer`, `World`, `NodeRegistry`, `EngineEvents`, register systems, install resize handler, kick off RAF loop, expose `EngineInstance` on `window.gameEngine`.

## Architectural Constraints

- **Threading:** Single-threaded — one RAF loop drives all systems sequentially via `world.update(dt)` (`src/engine/engine.ts` lines 50–58). No web workers.
- **Global state:** `window.gameEngine` (typed via `declare global { interface Window { gameEngine?: EngineInstance } }` in `src/engine/engineTypes.ts` lines 26–30) is the single shared handle between React and the engine. Components do not receive the engine via props or context.
- **System ordering matters:** `src/engine/setup/systemSetup.ts` lines 48–52 register `DimensionSystem` → `RenderSystem` → `SnapshotSystem` in that order. Re-ordering breaks the angle/length pipeline because `SnapshotSystem` reads `dimSystem.lastDimensions` / `lastAngleDimensions` from the same frame.
- **Path alias:** Both `tsconfig.app.json` and `vite.config.ts` define `"src/*"` → `src/*`. Every import uses `src/...` (not `@/`).
- **No circular imports detected:** engine ↔ ecs ↔ components form an acyclic graph; the React layer depends on engine but engine never imports from `src/app`.
- **`window.gameEngine` race:** `useFloorPlanStore.useState` reads `window.gameEngine?.api.events.lastSnapshot` at mount; if the engine is not yet ready it starts empty and rehydrates when the `"snapshot"` event arrives (`src/app/store/useFloorPlanStore.ts` lines 165–174).

## Anti-Patterns

### Direct `window.gameEngine` access from React components

**What happens:** Components such as `src/app/components/editor/PlanView2D.tsx` and the `BOTTOM_NAV` actions in `src/app/constants/navigation.ts` lines 17–26 reach into `window.gameEngine?.api` directly.
**Why it's wrong here:** Bypasses React context / props, makes components untestable without a real engine, hides the dependency.
**Do this instead:** Centralize access in a single hook (e.g. extend `useFloorPlanStore` with a `useEngineDispatch()`) so engine availability is a first-class concern.

### Re-implementing wall-id allocation in two places

**What happens:** `useUIStore.getAndIncrementNextWallId` (`src/app/store/useUIStore.ts` lines 53–56) maintains a closure counter starting at `INITIAL_NEXT_WALL_ID = 4`, while `src/engine/engine.ts` line 35 keeps `maxWallIdRef = INITIAL_NEXT_WALL_ID - 1` (= 9, since `INITIAL_NEXT_WALL_ID` in `src/engine/setup/defaultScene.ts` line 7 is 10).
**Why it's wrong here:** Two sources of truth for the next available wall id; values can drift apart.
**Do this instead:** Use only `window.gameEngine.api.getNextIds().wallId` (already used in `src/app/components/editor/PlanView2D.tsx` line 197) and delete the zustand counter.

### Comment-only legacy modules in production source

**What happens:** `src/app/store/useEditorStore.ts` and `src/app/engine/engineBridge.ts` are fully commented-out files. `src/app/store/useWallStore.ts` is a re-export shim for the renamed hook.
**Why it's wrong here:** Adds dead bytes and confuses readers about which store is live.
**Do this instead:** Delete the dead files; keep a deprecation alias only with explicit `@deprecated` JSDoc (the shim already does this).

## Error Handling

**Strategy:** Defensive — engine commands `console.warn` and `break` rather than throw, so a malformed UI dispatch never crashes the RAF loop.

**Patterns:**
- Dispatcher early-exits with `console.warn(...)` when a node or wall id is missing (`src/engine/commands/dispatcher.ts` lines 55, 70).
- Hooks return empty arrays when no snapshot yet (`src/app/store/useFloorPlanStore.ts` line 177).
- `PlanView2D.dispatch()` null-checks `window.gameEngine` and warns on miss (`src/app/components/editor/PlanView2D.tsx` lines 48–54).
- `NodeRegistry.getOrThrow(id)` is the only throw site, used during default-scene bootstrap (`src/engine/graph/NodeRegistry.ts` lines 31–35).

## Cross-Cutting Concerns

**Logging:** `console.warn` only — no logging framework.

**Validation:** Inline `if`-guards in the dispatcher; no schema validation library.

**Authentication:** Not present (placeholder `src/app/routes/PrivateRoute.tsx` exists but is unused; only `/` and `/projects` are wired).

**Event bus:**
- Engine-internal: `EngineEvents` typed pub/sub (`src/engine/events/EngineEvents.ts`).
- UI ↔ engine: `window.dispatchEvent(new CustomEvent("tinyhome:nav" | "tinyhome:toggleMode"))` produced by `InputSystem` and consumed by `EditorPage` (`src/engine/systems/InputSystem.ts` lines 23–30, `src/app/pages/EditorPage.tsx` lines 40–58).

**Dispose / cleanup:** `engine.dispose()` removes the resize listener, disposes orbit/gizmo/collision/input systems, traverses the scene calling `geometry.dispose()` and `material.dispose()`, calls `renderer.dispose()`, and deletes `window.gameEngine` (`src/engine/engine.ts` lines 77–95). `Canvas.tsx` triggers it on unmount.

---

*Architecture analysis: 2026-05-14*
