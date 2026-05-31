<!-- refreshed: 2026-05-14 -->
# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```
01-frontend/
├── index.html              # Vite entry → loads /src/main.tsx
├── package.json            # deps: react 19, three 0.183, react-konva 19, zustand 5, ...
├── vite.config.ts          # alias "src" → src/, plugins: @vitejs/plugin-react, @tailwindcss/vite
├── tsconfig.json           # composite root
├── tsconfig.app.json       # baseUrl=".", paths: "src/*" → ["src/*"]
├── tsconfig.node.json      # for vite.config.ts
├── eslint.config.js
├── public/                 # static assets, /hdri/studio.exr (loaded by sceneSetup.ts)
└── src/
    ├── main.tsx            # createRoot + <StrictMode><App /></StrictMode>
    ├── App.tsx             # renders <Router />
    ├── App.css
    ├── index.css           # Tailwind v4 entry
    ├── assets/
    │   └── objects.ts
    ├── app/                # ← all React UI lives here
    │   ├── components/
    │   │   ├── components.md
    │   │   └── editor/
    │   │       ├── BottomNavBar.tsx
    │   │       ├── BuildPanel.tsx
    │   │       ├── Canvas.tsx          # mounts <canvas> + createEngine(...)
    │   │       ├── LoadingScreen.tsx
    │   │       ├── PlanView2D.tsx      # react-konva Stage, 2D editor
    │   │       ├── SceneView3D.tsx     # thin wrapper over Canvas
    │   │       ├── ShortcutHint.tsx
    │   │       ├── TopNavBar.tsx
    │   │       └── WallPropertiesPanel.tsx
    │   ├── constants/
    │   │   ├── designTokens.ts         # T = { primary, surface, ... }
    │   │   └── navigation.ts           # BOTTOM_NAV[], Mode = "3d" | "2d"
    │   ├── engine/
    │   │   └── engineBridge.ts         # (legacy, all commented out)
    │   ├── hooks/
    │   │   └── hooks.md                # placeholder
    │   ├── pages/
    │   │   ├── EditorPage.tsx          # main editor page (3D + 2D)
    │   │   ├── HomePage.tsx            # marketing landing (not currently routed)
    │   │   ├── Plan2DPage.tsx          # standalone 2D wrapper
    │   │   └── ProjectsPage.tsx
    │   ├── routes/
    │   │   ├── PrivateRoute.tsx        # placeholder (unused)
    │   │   ├── Routes.tsx              # BrowserRouter, /, /projects
    │   │   └── routes.md
    │   ├── services/
    │   │   └── services.md             # placeholder
    │   └── store/
    │       ├── store.md
    │       ├── useEditorStore.ts       # (legacy, all commented out)
    │       ├── useFloorPlanStore.ts    # subscribes to engine "snapshot"
    │       ├── useUIStore.ts           # zustand: sidebar, viewport, wallId
    │       └── useWallStore.ts         # re-export shim → useFloorPlanStore
    └── engine/             # ← framework-free TS engine
        ├── engine.ts                   # createEngine(canvas) facade
        ├── engineTypes.ts              # EngineApi, EngineInstance, Window.gameEngine
        ├── commands/
        │   ├── dispatcher.ts           # switch over EngineCommand types
        │   └── EngineCommands.ts       # discriminated union of commands
        ├── components/                 # ECS data-only components
        │   ├── AmbientLightComponent.ts
        │   ├── AutoAlign.ts
        │   ├── CameraOrbit.ts
        │   ├── ColliderAABB.ts
        │   ├── DirectionalLightComponent.ts
        │   ├── Draggable.ts
        │   ├── DynamicBody.ts
        │   ├── Grounded.ts
        │   ├── LightHandle.ts
        │   ├── Mesh.ts
        │   ├── RoomGeometry.ts
        │   ├── Selectable.ts
        │   ├── SnapToGrid.ts
        │   ├── StaticBody.ts
        │   ├── Transform.ts
        │   ├── WallEndpoints.ts
        │   ├── WallNodes.ts
        │   ├── WallPolygon.ts
        │   ├── WallSize.ts
        │   └── WallTag.ts
        ├── ecs/
        │   ├── Component.ts            # abstract class Component {}
        │   ├── Entity.ts
        │   ├── Query.ts                # Query.entitiesWith(world, ...classes)
        │   ├── System.ts               # abstract update(world, dt)
        │   └── World.ts                # createEntity / addComponent / addSystem / update(dt)
        ├── events/
        │   └── EngineEvents.ts         # ECSSnapshot, AngleDimensionSnapshot, EngineEvents bus
        ├── game/                       # factories: compose components into entities
        │   ├── GroundFactory.ts
        │   ├── LightFactory.ts         # createAmbientLight, createDirectionalLight
        │   └── WallFactory.ts          # createWall(world, scene, opts)
        ├── graph/
        │   ├── NodeRegistry.ts         # Map<id, NodeData> + nodeCaps
        │   └── RoomDetection.ts        # findRooms(world, nodeReg)
        ├── setup/
        │   ├── defaultScene.ts         # INITIAL_NEXT_NODE_ID = 20, INITIAL_NEXT_WALL_ID = 10
        │   ├── sceneSetup.ts           # createScene(canvas) → THREE Scene/Camera/Renderer
        │   └── systemSetup.ts          # createSystems(world, scene, ...) registers all systems in order
        ├── systems/                    # ECS systems run by World.update each frame
        │   ├── CannonCollisionSystem.ts
        │   ├── DimensionSystem.ts      # lastDimensions, lastAngleDimensions
        │   ├── GizmoSystem.ts          # three.js TransformControls
        │   ├── GroundSystem.ts
        │   ├── InputSystem.ts          # global keyboard shortcuts
        │   ├── LightSystem.ts
        │   ├── OrbitControlSystem.ts   # three.js OrbitControls + presets
        │   ├── PlacementAssistSystem.ts
        │   ├── RenderSystem.ts         # renderer.render(scene, camera)
        │   ├── RoomSystem.ts           # detects rooms, adds RoomGeometry
        │   ├── SnapshotSystem.ts       # emits "snapshot" event
        │   └── WallGeometrySystem.ts   # miter joints, ExtrudeGeometry
        └── utils/
            └── wallHelpers.ts          # recomputeWallAABB(...)
```

## Directory Purposes

**`src/app/`:**
- Purpose: All React UI — pages, routing, components, hooks, store, constants.
- Contains: `.tsx` components + zustand store; no three.js / cannon code lives here.
- Key files: `src/app/pages/EditorPage.tsx`, `src/app/components/editor/PlanView2D.tsx`, `src/app/store/useFloorPlanStore.ts`.

**`src/app/components/editor/`:**
- Purpose: Editor chrome and viewports (TopNavBar, BottomNavBar, BuildPanel, LoadingScreen, ShortcutHint, WallPropertiesPanel, Canvas, SceneView3D, PlanView2D).
- Contains: PascalCase `.tsx` files, each exporting one default React component.
- Key files: `Canvas.tsx` (engine bootstrap), `PlanView2D.tsx` (react-konva editor).

**`src/app/pages/`:**
- Purpose: Route-level page components.
- Contains: `EditorPage.tsx`, `HomePage.tsx`, `Plan2DPage.tsx`, `ProjectsPage.tsx`.

**`src/app/routes/`:**
- Purpose: React Router v7 setup.
- Contains: `Routes.tsx` (exports `AppRoutes`), `PrivateRoute.tsx` (unused placeholder).

**`src/app/store/`:**
- Purpose: React-side state (zustand) + engine-subscriber hook.
- Contains: `useUIStore.ts` (zustand), `useFloorPlanStore.ts` (engine snapshot subscriber).

**`src/app/constants/`:**
- Purpose: Static config consumed by UI (design tokens, nav schema).
- Contains: `designTokens.ts`, `navigation.ts`.

**`src/app/hooks/`, `src/app/services/`, `src/app/engine/`:**
- Purpose: Reserved namespaces (mostly placeholder `.md` files or fully commented stubs).

**`src/engine/`:**
- Purpose: Framework-free TypeScript engine.
- Contains: ECS core, components, systems, commands, events, factories, graph, setup, engine facade.
- Imports only `three`, `three/addons`, `cannon-es`, `@dimforge/rapier3d-compat` — never imports from `src/app`.

**`src/engine/ecs/`:**
- Purpose: Generic ECS primitives (`World`, `Entity`, `Component`, `System`, `Query`).

**`src/engine/components/`:**
- Purpose: Data-only classes extending `Component`. Each file is one class.

**`src/engine/systems/`:**
- Purpose: All per-frame logic. Each class extends `System` and implements `update(world, dt)`.

**`src/engine/commands/`:**
- Purpose: UI→engine command shapes (`EngineCommands.ts`) and the switch-based dispatcher (`dispatcher.ts`).

**`src/engine/events/`:**
- Purpose: Typed pub/sub bus and the `ECSSnapshot` shape that React consumes.

**`src/engine/game/`:**
- Purpose: Factories that compose components into typed entities.

**`src/engine/graph/`:**
- Purpose: Floor-plan graph services (`NodeRegistry`, `RoomDetection`).

**`src/engine/setup/`:**
- Purpose: Bootstrap helpers called by `createEngine` (`sceneSetup`, `systemSetup`, `defaultScene`).

**`src/engine/utils/`:**
- Purpose: Small geometry helpers (currently only `wallHelpers.recomputeWallAABB`).

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Vite entry, mounts `<App />`.
- `src/App.tsx`: Renders `<Router />`.
- `src/app/routes/Routes.tsx`: `BrowserRouter`, defines `/` → `EditorPage` and `/projects` → `ProjectsPage`.

**Configuration:**
- `vite.config.ts`: Vite + React + Tailwind, alias `"src"` → `src/`.
- `tsconfig.app.json`: `paths: { "src/*": ["src/*"] }`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`, `noUnusedLocals: true`.
- `tsconfig.node.json`: For `vite.config.ts` itself.
- `eslint.config.js`: ESLint flat config with `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`.

**Engine bootstrap:**
- `src/engine/engine.ts`: `createEngine(canvas)`.
- `src/engine/engineTypes.ts`: `EngineApi`, `EngineInstance`, `Window.gameEngine`.
- `src/engine/setup/sceneSetup.ts`: three.js Scene/Camera/Renderer, HDRI from `/hdri/studio.exr`.
- `src/engine/setup/systemSetup.ts`: Registers systems in order: Orbit → Gizmo → PlacementAssist → Collision → Light → WallGeometry → Room → Dimension → Render → Snapshot.
- `src/engine/setup/defaultScene.ts`: Default node/wall layout (currently commented out at call site in `engine.ts`).

**Core Logic:**
- `src/engine/commands/dispatcher.ts`: All mutating commands.
- `src/engine/graph/NodeRegistry.ts`: Node graph source of truth.
- `src/engine/systems/WallGeometrySystem.ts`: Miter joints + wall mesh extrusion.
- `src/engine/systems/DimensionSystem.ts`: Length + angle snapshots.
- `src/engine/systems/SnapshotSystem.ts`: Per-frame snapshot emit.

**React ↔ Engine bridge:**
- `src/app/components/editor/Canvas.tsx`: `createEngine(canvasRef.current)` in `useEffect`.
- `src/app/store/useFloorPlanStore.ts`: Subscribes to `"snapshot"`, converts world→px.
- `src/app/components/editor/PlanView2D.tsx`: Calls `window.gameEngine.api.dispatch(...)`.

**Testing:**
- No test runner or test files present in `src/`.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` — `PlanView2D.tsx`, `WallPropertiesPanel.tsx`.
- Hooks: `useCamelCase.ts` — `useFloorPlanStore.ts`, `useUIStore.ts`.
- Engine classes / modules: `PascalCase.ts` — `DimensionSystem.ts`, `NodeRegistry.ts`, `WallFactory.ts`.
- Helpers / configs: `camelCase.ts` — `wallHelpers.ts`, `designTokens.ts`, `sceneSetup.ts`, `defaultScene.ts`, `engineBridge.ts`, `engineTypes.ts`, `objects.ts`.
- Entry shims: lowercase — `main.tsx`, `engine.ts`.
- Placeholder docs alongside empty dirs: `lowercase.md` — `components.md`, `hooks.md`, `routes.md`, `services.md`, `store.md`.

**Directories:**
- All lowercase, single word — `app`, `engine`, `components`, `editor`, `ecs`, `systems`, `commands`, `events`, `game`, `graph`, `setup`, `utils`, `store`, `hooks`, `pages`, `routes`, `constants`.

**Symbols inside files:**
- Classes: `PascalCase` — `World`, `EngineEvents`, `DimensionSystem`.
- Component constructors: extend `Component`, named after the data they hold — `Transform`, `WallNodes`, `WallTag`.
- Type aliases: `PascalCase` — `EngineCommand`, `ECSSnapshot`, `Node2D`, `AngleDimension2D`.
- Functions: `camelCase` — `createEngine`, `createDispatcher`, `computePolygonCentroid`, `snapToNodeOrGrid`.
- Constants: `UPPER_SNAKE_CASE` — `INITIAL_NEXT_NODE_ID`, `PX_PER_WORLD`, `ANGLE_ARC_RADIUS`, `MIN_DIM_LENGTH_M`.
- Custom DOM events: `tinyhome:nav`, `tinyhome:toggleMode`.

**Imports:**
- Always use the `src/` path alias — `import { World } from "src/engine/ecs/World"`. No relative `../../` from `src/app` into `src/engine`.
- Inside `src/engine/`, some modules use relative paths (`../components/WallTag`); both styles coexist.

## Where to Add New Code

**New React feature / panel:**
- Component: `src/app/components/editor/MyPanel.tsx` (PascalCase, default export).
- Wire into editor: import from `src/app/pages/EditorPage.tsx` and render inside the existing layout.
- Constants / nav entries: add to `src/app/constants/navigation.ts` `BOTTOM_NAV`.

**New page / route:**
- Page component: `src/app/pages/MyPage.tsx`.
- Route: register in `src/app/routes/Routes.tsx` inside `<RouterRoutes>`.

**New engine command:**
1. Add the variant to the union in `src/engine/commands/EngineCommands.ts`.
2. Add a `case` in `createDispatcher`'s switch in `src/engine/commands/dispatcher.ts`.
3. Dispatch it from UI via `window.gameEngine.api.dispatch({ type: "MY_CMD", ... })`.

**New ECS component (data):**
- File: `src/engine/components/MyComponent.ts`.
- Class: `export class MyComponent extends Component { ... }` (matches `src/engine/components/Transform.ts` pattern).
- Attach in a factory (e.g. `src/engine/game/WallFactory.ts`) or directly via `world.addComponent(entity, new MyComponent(...))`.

**New ECS system (logic):**
- File: `src/engine/systems/MySystem.ts` — `export class MySystem extends System { update(world: World, dt: number): void { ... } }`.
- Register it in `src/engine/setup/systemSetup.ts` `createSystems(...)`. Place it *before* `SnapshotSystem` if it writes data that needs to appear in the next snapshot.
- If it produces UI-visible data, extend `ECSSnapshot` in `src/engine/events/EngineEvents.ts` and emit from `SnapshotSystem`.

**New entity factory:**
- File: `src/engine/game/MyFactory.ts`, export a `createMyEntity(world, scene, opts)` function (matches `WallFactory.createWall` shape).

**New snapshot consumer in React:**
- Subscribe via the existing hook — extend `useFloorPlanStore` to map the new `ECSSnapshot` field into a 2D-projected type, then consume from `PlanView2D.tsx`.
- Alternatively, subscribe directly with `window.gameEngine?.api.events.on("snapshot", ...)` in a new hook under `src/app/store/`.

**New zustand store:**
- File: `src/app/store/useMyStore.ts` (matches `src/app/store/useUIStore.ts` pattern using `create<...>()`).

**New design token / color:**
- Add to `src/app/constants/designTokens.ts` `T` object.

**Shared geometry helper:**
- File: `src/engine/utils/myHelper.ts`. Pure functions only.

**HDRI / static asset:**
- Drop in `public/hdri/...` and reference by absolute URL `/hdri/...` (see `src/engine/setup/sceneSetup.ts` for `EXRLoader`).

## Special Directories

**`public/`:**
- Purpose: Static files served as-is by Vite (includes `/hdri/studio.exr` loaded by `sceneSetup.ts`).
- Generated: No.
- Committed: Yes.

**`scratch/`:**
- Purpose: Out-of-scope scratch dir (excluded per task scope; not scanned).

**`dist/`, `.vite/`, `node_modules/`:**
- Purpose: Build artifacts and dependencies.
- Generated: Yes.
- Committed: No.

**Placeholder `.md` files inside empty source dirs (`components.md`, `hooks.md`, `routes.md`, `services.md`, `store.md`):**
- Purpose: Reserve namespace + document intent.
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-05-14*
