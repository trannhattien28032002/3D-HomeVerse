<!-- generated-by: gsd-doc-writer -->
# Architecture — 3D HomeVerse

## System Overview

3D HomeVerse is a browser-based interior design tool that lets users build and visualise room layouts through two complementary views: a real-time 3D viewport rendered with Three.js, and a 2D top-down floor-plan editor built on React Konva. The two views share a single source of truth — a custom, framework-free ECS (Entity Component System) engine written in TypeScript — which runs its own `requestAnimationFrame` loop entirely independently of React's render cycle. React acts purely as a display and input layer; it reads engine state through a typed event bus and mutates it only through a discriminated-union command API.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser Window                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     React UI  (src/app/)                    │   │
│  │                                                             │   │
│  │   EditorPage                                                │   │
│  │   ├── SceneView3D  ──── <canvas> ──────────────────────┐   │   │
│  │   │                                                     │   │   │
│  │   ├── PlanView2D  (react-konva Stage/Layer)             │   │   │
│  │   │   ├── DrawWallTool                                  │   │   │
│  │   │   └── SelectTool                                    │   │   │
│  │   │                                                     │   │   │
│  │   ├── TopNavBar / BottomNavBar / BuildPanel             │   │   │
│  │   └── WallPropertiesPanel                               │   │   │
│  │                                                         │   │   │
│  │   Stores (Zustand)                                      │   │   │
│  │   ├── useUIStore          (sidebar, viewport, wall IDs) │   │   │
│  │   └── useFloorPlanStore   (snapshot → px conversion)   │   │   │
│  └──────────────────────────┬───────────────┬─────────────┘   │   │
│                             │ dispatch()    │ events.on()      │   │
│                             │ (commands)    │ (snapshot)       │   │
│                             ▼               ▲                  │   │
│  ┌──────────────────────────────────────────┼─────────────┐   │   │
│  │              ECS Engine  (src/engine/)   │             │   │   │
│  │                                          │             │   │   │
│  │   World ──► System pipeline (per frame)  │             │   │   │
│  │   │         Orbit → Gizmo → Placement    │             │   │   │
│  │   │         → Collision → Light          │             │   │   │
│  │   │         → WallGeometry → Room        │             │   │   │
│  │   │         → Dimension → Render         │             │   │   │
│  │   │         → Snapshot ─────────────────►│             │   │   │
│  │   │                                                    │   │   │
│  │   ├── NodeRegistry  (wall graph topology)              │   │   │
│  │   ├── MeshRegistry  (Three.js mesh lifecycle)          │   │   │
│  │   ├── MaterialRegistry (shared materials)              │   │   │
│  │   ├── UndoHistory   (SceneDocument snapshots)          │   │   │
│  │   └── THREE.Scene / Camera / Renderer ─────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Two-Layer Architecture

The codebase is split into two directories with a strict one-way dependency rule.

### `src/engine/` — Framework-free ECS engine

The engine layer is a pure TypeScript module. It has **no imports from `src/app/`** and no React dependencies. Its only external imports are `three`, `cannon-es`, and `@dimforge/rapier3d-compat`. The engine owns:

- The ECS world and all component data
- The `requestAnimationFrame` game loop (`engine.ts`)
- Three.js scene, camera, and renderer initialisation (`setup/sceneSetup.ts`)
- The wall graph topology (`graph/NodeRegistry.ts`, `graph/RoomDetection.ts`)
- The command dispatcher (`commands/dispatcher.ts`)
- The typed event bus (`events/EngineEvents.ts`)
- Serialisation to and from `SceneDocument` (`serialization/`)

### `src/app/` — React UI layer

The UI layer contains all React components (`.tsx`), Zustand stores, and routing. It **does not import Three.js or Cannon-es** directly. It communicates with the engine exclusively through:

1. `window.gameEngine.api.dispatch(command)` — to mutate engine state.
2. `engine.api.events.on("snapshot", handler)` — to read engine state reactively.
3. `EngineContext` — a React context that holds the `EngineInstance` reference so components below `EditorPage` can access the engine without going through `window`.

### Directory structure

```
src/
├── engine/
│   ├── ecs/            # ECS primitives: World, Entity, Component, System, Query
│   ├── components/     # Data-only component classes
│   ├── systems/        # Per-frame logic systems
│   ├── commands/       # EngineCommands (discriminated union) + dispatcher + history
│   ├── events/         # EngineEvents pub/sub bus + ECSSnapshot types
│   ├── game/           # Entity factories: WallFactory, LightFactory, GroundFactory
│   ├── graph/          # NodeRegistry, RoomDetection (DCEL half-edge algorithm)
│   ├── rendering/      # MeshRegistry, MaterialRegistry
│   ├── serialization/  # SceneDocument type, serialize, deserialize, validate
│   ├── setup/          # createEngine facade, sceneSetup, systemSetup, defaultScene
│   ├── engine.ts       # Public createEngine() function + game loop
│   └── engineTypes.ts  # EngineApi, EngineInstance, CameraPreset types
│
└── app/
    ├── components/editor/  # Canvas, SceneView3D, PlanView2D, TopNavBar, BottomNavBar,
    │   │                   # BuildPanel, WallPropertiesPanel, LoadingScreen, ShortcutHint
    │   └── tools/          # DrawWallTool, SelectTool (stateful tool objects)
    ├── engine/             # EngineContext.tsx (React context + useEngineOrNull hook)
    ├── pages/              # EditorPage, HomePage, ProjectsPage, Plan2DPage
    ├── routes/             # Routes.tsx (BrowserRouter)
    ├── store/              # useUIStore, useFloorPlanStore, useWallStore, useEditorStore
    └── constants/          # designTokens.ts, navigation.ts
```

---

## ECS Design

### Core Primitives

**`World`** (`ecs/World.ts`) is the ECS container. It maintains:
- `entities: Set<number>` — auto-incrementing integer IDs.
- `components: Map<ComponentClass, Map<entityId, Component>>` — a sparse map indexed by component constructor.
- `systems: System[]` — ordered list of systems, iterated every frame.

Key methods:

```typescript
world.createEntity(): number
world.destroyEntity(entity: number): void
world.addComponent<T extends Component>(entity, component: T): void
world.removeComponent<T>(entity, componentType: ComponentClass<T>): void
world.getComponent<T>(entity, componentType): T | undefined
world.hasComponent<T>(entity, componentType): boolean
world.addSystem(system: System): void
world.update(deltaTime: number): void  // iterates all systems in order
```

**`Component`** (`ecs/Component.ts`) is an abstract base class. All component subclasses are data-only — no methods, no logic.

**`System`** (`ecs/System.ts`) is an abstract base class with a single `update(world: World, deltaTime: number): void` method called by `World.update()` every frame.

**`Query`** (`ecs/Query.ts`) is a static utility that finds entities owning a specific set of component types:

```typescript
Query.entitiesWith(world, WallTag, WallNodes, WallSize, Transform)
// returns number[] — entity IDs that have ALL four components
```

Systems use `Query.entitiesWith` at the top of each `update()` call rather than caching results, keeping the ECS stateless and predictable.

### Component Catalogue

| Component | Purpose |
|---|---|
| `Transform` | World-space position (x, y, z) |
| `Mesh` | Reference key into MeshRegistry |
| `Selectable` | Marks entity as selectable via GizmoSystem |
| `Draggable` | Marks entity as draggable |
| `SnapToGrid` | Grid snap behaviour during placement |
| `AutoAlign` | Automatic alignment during placement |
| `WallTag` | Carries `wallId` (stable integer, distinct from ECS entity id) |
| `WallNodes` | Links `startNodeId` and `endNodeId` in NodeRegistry; holds `thickness` |
| `WallEndpoints` | World-space endpoints derived from nodes |
| `WallSize` | `thickness` and `height` in world units (metres) |
| `WallPolygon` | Miter-cut 4-point XZ polygon; absent triggers WallGeometrySystem rebuild |
| `RoomGeometry` | Detected room polygon + area |
| `CameraOrbit` | Camera target and orbit state |
| `ColliderAABB` | Axis-aligned bounding box for physics |
| `DynamicBody` | Cannon-es dynamic rigid body |
| `StaticBody` | Cannon-es static rigid body |
| `Grounded` | Marks entity as on the ground plane |
| `AmbientLightComponent` | Ambient light intensity |
| `DirectionalLightComponent` | Directional light position and intensity |
| `LightHandle` | Interactive handle for a light entity |

### Key Design Rules

- Components contain **data only** — no update methods, no references to systems.
- Removing a component (e.g. `WallPolygon`) is the signal to a system that a rebuild is needed next frame.
- `WallTag.wallId` is a stable user-facing ID assigned at creation time. The ECS entity id is an internal implementation detail.

---

## System Execution Order

Systems are registered in `setup/systemSetup.ts` in a fixed order. `World.update()` iterates the array sequentially each frame:

```
1. OrbitControlSystem      — updates Three.js OrbitControls; processes camera input
2. GizmoSystem             — renders transform gizmo; handles drag-selection in 3D viewport
3. PlacementAssistSystem   — snap-to-grid and auto-align for entities being placed
4. CannonCollisionSystem   — steps the Cannon-es physics world; syncs body positions → Transform
5. LightSystem             — syncs AmbientLightComponent / DirectionalLightComponent → THREE lights
6. WallGeometrySystem      — builds miter-joined wall meshes via ExtrudeGeometry when WallPolygon absent
7. RoomSystem              — runs RoomDetection.findRooms(); creates/updates room floor meshes
8. DimensionSystem         — computes length annotations + angle annotations for all wall corners
9. RenderSystem            — calls renderer.render(scene, camera)
10. SnapshotSystem          — hashes world state; emits ECSSnapshot via EngineEvents if changed
```

The ordering enforces causality: geometry is built before rooms are detected, dimensions are computed after geometry, and the snapshot is emitted only after everything else has completed for the frame.

---

## React ↔ Engine Bridge

### Bootstrap

`Canvas.tsx` is the mount point. Its `useEffect` calls `createEngine(canvasRef.current)`, which:

1. Creates a Three.js `Scene`, `PerspectiveCamera` (45° FOV), and `WebGLRenderer` on the provided `<canvas>` element.
2. Creates a `World`, `NodeRegistry`, `EngineEvents`, `MeshRegistry`, and `MaterialRegistry`.
3. Registers all systems in order via `createSystems()`.
4. Creates the command `dispatcher`.
5. Starts the `requestAnimationFrame` loop (`world.update(dt)` every frame).
6. Assigns the `EngineInstance` to `window.gameEngine`.
7. Returns the `EngineInstance`.

`EditorPage` receives the instance via `Canvas`'s `onEngineCreated` callback and provides it through `EngineContext.Provider`, making it available to all child components via `useEngineOrNull()`.

### Command Flow (UI → Engine)

All state mutations flow as typed commands. `PlanView2D` (and tools inside it) call:

```typescript
window.gameEngine.api.dispatch({ type: "ADD_WALL", wallId, startNodeId, endNodeId, thickness })
```

The dispatcher (`commands/dispatcher.ts`) is a pure `switch` statement. Each case manipulates `NodeRegistry`, `World` components, and/or `wallEntityByWallId` synchronously — no async, no callbacks. The next frame's system pipeline will observe the change and rebuild affected meshes.

Full command union (`EngineCommands.ts`):

| Command | Effect |
|---|---|
| `ENSURE_NODE` | Creates or retrieves a node by id at (x, z) |
| `MOVE_NODE` | Moves a node; invalidates WallPolygon on all connected walls |
| `ADD_WALL` | Creates a wall entity linking two existing nodes |
| `REMOVE_WALL` | Destroys the wall entity; cleans up orphan nodes |
| `MERGE_NODE` | Merges sourceNodeId into targetNodeId; reroutes connected walls |
| `SPLIT_WALL` | Splits a wall at (x, z) by inserting a new node and a new wall |
| `RESOLVE_INTERSECTIONS` | Auto-splits any existing walls that the given wall crosses |
| `UPDATE_WALL` | Updates thickness and/or height; clears WallPolygon to force rebuild |

### Undo / Redo

The `EngineApi` exposes `transaction`, `beginTransaction`, `commitTransaction`, `undo`, and `redo`. The `UndoHistory` class stores up to 50 `SceneDocument` snapshots (serialised topology only — no mesh data). Undo restores a snapshot via `deserializeScene`, which re-dispatches `ENSURE_NODE` and `ADD_WALL` commands to rebuild the ECS world from the stored topology.

### Event Flow (Engine → UI)

`SnapshotSystem` runs last every frame. It computes a hash over all wall, node, and cap data. If the hash differs from the previous frame, it calls:

```typescript
events.emit("snapshot", ecsSnapshot)
```

`useFloorPlanStore` subscribes to this event:

```typescript
engine.api.events.on("snapshot", setSnap)
```

The snapshot is then converted from world coordinates to pixel coordinates (scale: `100 px/world-unit`) inside a `useMemo` and returned as typed `Node2D`, `Wall2D`, `Room2D`, `Dimension2D`, and `AngleDimension2D` objects. `PlanView2D` renders these directly as Konva shapes.

`EngineEvents` also caches `lastSnapshot` so components that mount after the first emission can immediately sync without waiting for the next frame.

---

## Wall Graph Representation

Walls are represented as a **node graph** rather than as independent mesh objects. This is the most important architectural decision in the engine.

### NodeRegistry

`NodeRegistry` (`graph/NodeRegistry.ts`) is a `Map<number, NodeData>` where:

```typescript
type NodeData = {
    id: number;
    x: number;          // world-space X (metres)
    z: number;          // world-space Z (metres)
    connectedWallIds: Set<number>;  // all wall IDs that reference this node
};
```

Nodes are the **source of truth** for all geometric positions. Moving a node automatically repositions every wall that references it — no wall coordinates need to be updated individually.

### Wall as Derived Geometry

A wall ECS entity holds only:
- `WallNodes` — `{ startNodeId, endNodeId, thickness }`
- `WallSize` — `{ thickness, height }`
- `WallTag` — `{ wallId }`
- `Transform` — center position (derived, kept for AABB queries)
- `WallPolygon` — the miter-cut XZ polygon (computed lazily; removed when topology changes to trigger rebuild)

`WallGeometrySystem` reads `WallNodes` + `NodeRegistry` positions each frame, computes the miter-cut polygon for each wall, builds a Three.js `Shape` from it, and calls `ExtrudeGeometry` to produce the 3D mesh. Miter joints at multi-wall junctions are computed by solving the intersection of offset edge lines from adjacent walls.

### Topology Operations via Dispatcher

All graph mutations go through the dispatcher commands listed above. For example, when `DrawWallTool` places a new wall segment that crosses an existing wall, it dispatches `RESOLVE_INTERSECTIONS`, which detects crossing points using parametric line-segment intersection, then calls `SPLIT_WALL` for each crossing — resulting in a properly connected planar graph.

### Room Detection

`RoomSystem` invokes `RoomDetection.findRooms()` each frame. The algorithm uses a **Half-Edge (DCEL)** structure: every wall edge is represented by two directed half-edges (one per direction). The traversal follows each face loop (always turning to the next clockwise edge at each node) to identify closed interior polygons. Detected rooms become `RoomGeometry` components on ECS entities; `RoomSystem` renders a floor mesh for each.

---

## 2D Floor Plan Editor — Data Flow

The 2D editor (`PlanView2D.tsx`) is a separate visual mode activated when the user switches from `"3d"` to `"2d"` in `EditorPage`. The Three.js canvas remains mounted but hidden; the ECS engine keeps running.

```
ECS World (per frame)
    │
    ▼
DimensionSystem
    writes: lastDimensions[], lastAngleDimensions[]
    │
    ▼
SnapshotSystem
    reads: WallTag+WallNodes+WallSize+Transform (via Query)
           NodeRegistry.all()
           NodeRegistry.nodeCaps
           RoomGeometry entities
           dimensionSystem.lastDimensions
           dimensionSystem.lastAngleDimensions
    computes: hash
    if changed → events.emit("snapshot", ECSSnapshot)
    │
    ▼  (EngineEvents pub/sub)
useFloorPlanStore (React hook)
    subscribes: engine.api.events.on("snapshot", setSnap)
    converts: world coords → px  (scale: 100 px per world unit)
              world Z → canvas Y (same sign; no axis flip)
    memoises: Node2D[], Wall2D[], Cap2D[], Room2D[],
              Dimension2D[], AngleDimension2D[]
    │
    ▼
PlanView2D (react-konva Stage)
    renders:
      Layer 0 – room fills (polygon shapes)
      Layer 1 – wall polygons (miter-cut filled shapes)
      Layer 2 – node cap fills (junction gap fills)
      Layer 3 – dimension annotations (arrows + labels)
      Layer 4 – angle arcs (Arc shapes + degree labels)
      Layer 5 – node handles (Circle shapes)
    │
    ├── DrawWallTool (active in "draw" mode)
    │     click → dispatch ENSURE_NODE, ADD_WALL, RESOLVE_INTERSECTIONS
    │     drag preview → imperative Konva Line update (no React re-render)
    │     angle snap → applyAngleSnap() aligns to connected wall directions
    │
    └── SelectTool (active in "select" mode)
          click wall → dispatch (highlight selection)
          drag node → dispatch MOVE_NODE (inside beginTransaction/commitTransaction)
          release    → commitTransaction (pushes to UndoHistory)
```

### Coordinate System

| Axis | Engine (world) | Konva (canvas) |
|---|---|---|
| Horizontal | X (metres) | x (pixels) |
| Depth | Z (metres) | y (pixels) |
| Vertical | Y (metres) | — (not shown in 2D) |
| Scale | 1 world unit = 1 metre | 100 px per world unit |

World Z maps directly to canvas Y with the same sign. There is no axis flip between the two spaces.

### Serialisation

The file format (`SceneDocument`, version 1) stores **topology only** — nodes with (id, x, z) and walls with (wallId, startNodeId, endNodeId, thickness, height). No mesh data, no material data, and no render state is persisted. On load, `deserializeScene` replays `ENSURE_NODE` and `ADD_WALL` commands; the system pipeline rebuilds all geometry from scratch on subsequent frames. The file extension used by the save/load UI is `.homeverseplan`.

---

## Tech Stack Summary

| Concern | Library | Version |
|---|---|---|
| UI framework | React | ^19.2.4 |
| Language | TypeScript | ~6.0.2 |
| Build tool | Vite | ^8.0.4 |
| 3D rendering | Three.js | ^0.183.2 |
| 2D canvas | react-konva / konva | ^19.2.3 / ^10.2.5 |
| Physics (3D) | cannon-es | ^0.20.0 |
| Physics (alt) | @dimforge/rapier3d-compat | ^0.19.3 |
| State management | Zustand | ^5.0.12 |
| Routing | React Router DOM | ^7.14.0 |
| Styling | Tailwind CSS | ^4.2.2 |
| Icons | lucide-react | ^1.8.0 |
