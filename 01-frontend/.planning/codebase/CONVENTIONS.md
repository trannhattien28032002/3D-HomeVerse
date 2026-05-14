# Coding Conventions

**Analysis Date:** 2026-05-14

## Tooling Summary

- **Formatter:** None. No Prettier (`.prettierrc*`) or Biome (`biome.json`) config exists. Formatting is enforced only by ESLint + the TypeScript compiler.
- **Linter:** ESLint 9 (flat config) — `eslint.config.js`.
- **Typechecker:** TypeScript `~6.0.2` with project references (`tsconfig.json` → `tsconfig.app.json`, `tsconfig.node.json`).
- **Run:** `npm run lint` (ESLint over all `*.{ts,tsx}`). Typecheck happens as the first step of `npm run build` (`tsc -b && vite build`).

## ESLint Configuration

From `eslint.config.js`:

```js
defineConfig([
    globalIgnores(['dist']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
    },
])
```

**Active rule sets:**
- `@eslint/js` → `js.configs.recommended` — JavaScript baseline (`no-undef`, `no-unused-vars`, etc.).
- `typescript-eslint` → `tseslint.configs.recommended` — TS baseline (`@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, etc.).
- `eslint-plugin-react-hooks` → `reactHooks.configs.flat.recommended` — enforces `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`.
- `eslint-plugin-react-refresh` → `reactRefresh.configs.vite` — enforces `react-refresh/only-export-components` so HMR boundaries stay clean.

**Globals:** `globals.browser` (window/document/etc. available; no Node globals in `src/`).

**Ignored:** the `dist/` build output.

**No custom rule overrides exist** — everything is the recommended preset.

## TypeScript Configuration

`tsconfig.json` is a composite root with `references` to:
- `tsconfig.app.json` — covers `src/` (the React + engine code).
- `tsconfig.node.json` — covers `vite.config.ts` only.

Both configs share these compiler options:

| Option | Value | Effect |
|---|---|---|
| `target` | `"es2023"` | Modern output, no down-leveling. |
| `module` | `"esnext"` | ESM only. |
| `moduleResolution` | `"bundler"` | Resolution defers to Vite. |
| `allowImportingTsExtensions` | `true` | `.tsx` shows up in import paths (see `src/main.tsx`). |
| `verbatimModuleSyntax` | `true` | **Type-only imports MUST use `import type`** — bare `import` for types fails compile. |
| `moduleDetection` | `"force"` | Every file is treated as a module. |
| `noEmit` | `true` | `tsc` only typechecks; Vite emits. |
| `skipLibCheck` | `true` | Skips `.d.ts` checking for deps. |
| `erasableSyntaxOnly` | `true` | Disallows enums / parameter properties / non-erasable TS syntax. |
| `noUnusedLocals` | `true` | Unused locals are compile errors. |
| `noUnusedParameters` | `true` | Unused parameters are compile errors. |
| `noFallthroughCasesInSwitch` | `true` | `switch` cases need explicit `break` / `return`. |
| `ignoreDeprecations` | `"5.0"` | Suppresses TS 5.x deprecation warnings (carried into TS 6). |

**`tsconfig.app.json` only:**
- `lib`: `["ES2023", "DOM", "DOM.Iterable"]`
- `types`: `["vite/client"]`
- `jsx`: `"react-jsx"` (automatic runtime; no `import React`)
- `baseUrl: "."` + `paths: { "src/*": ["src/*"] }` — the **`src/` path alias**.
- `include: ["src"]`.

**`tsconfig.node.json` only:**
- `lib`: `["ES2023"]` (no DOM).
- `types`: `["node"]`.
- `include: ["vite.config.ts"]`.

The matching Vite alias lives in `vite.config.ts`:

```ts
resolve: { alias: { "src": path.resolve(__dirname, "src") } }
```

## Naming Patterns

**Files:**
- React component files: PascalCase `.tsx` — e.g., `EditorPage.tsx`, `PlanView2D.tsx`, `WallPropertiesPanel.tsx`, `BottomNavBar.tsx`.
- ECS Component files: PascalCase `.ts` named after the data concept — `Transform.ts`, `WallTag.ts`, `ColliderAABB.ts`.
- ECS System files: PascalCase `.ts` with `System` suffix — `RenderSystem.ts`, `InputSystem.ts`, `WallGeometrySystem.ts`.
- Factory files: PascalCase `.ts` with `Factory` suffix — `WallFactory.ts`, `LightFactory.ts`, `GroundFactory.ts`.
- Store/hook files: camelCase `.ts` with `use` prefix — `useUIStore.ts`, `useFloorPlanStore.ts`, `useWallStore.ts`.
- Utility files: camelCase `.ts` — `wallHelpers.ts`.
- Type / constant modules: camelCase `.ts` — `engineTypes.ts`, `designTokens.ts`, `navigation.ts`.
- Setup files: camelCase `.ts` — `sceneSetup.ts`, `systemSetup.ts`, `defaultScene.ts`.
- Event / command modules: PascalCase `.ts` — `EngineEvents.ts`, `EngineCommands.ts`.
- Internal docs use `.md` files inside their directory (e.g., `src/app/store/store.md`, `src/app/components/components.md`).

**Classes:**
- PascalCase for all classes: `World`, `Query`, `RenderSystem`, `EngineEvents`, `NodeRegistry`.
- Abstract base classes use the same casing: `Component`, `System`.
- ECS Components extend `Component`, named as plain nouns: `Transform`, `Mesh`, `WallTag`, `Selectable`.
- ECS Systems extend `System`, named `<Domain>System`: `RenderSystem`, `InputSystem`, `GizmoSystem`.

**Functions:**
- camelCase for exported functions: `createEngine`, `createWall`, `createDispatcher`, `computePolygonCentroid`.
- Factory functions use `create` prefix: `createWall`, `createEngine`, `createScene`, `createSystems`, `createDispatcher`, `createAmbientLight`.
- File-local helpers stay camelCase: `nodeToPx`, `wallToPx`, `snapToNodeOrGrid`, `dispatch` (inside `PlanView2D.tsx`).
- React hooks use `use` prefix: `useFloorPlanStore`, `useUIStore`.

**Variables / Constants:**
- Local variables: camelCase — `deltaTime`, `wallEntity`, `stageScale`.
- Module-level constants: `SCREAMING_SNAKE_CASE` — `PX_PER_WORLD`, `WALL_THICKNESS`, `SNAP_RADIUS`, `ZOOM_MIN`, `ZOOM_MAX`, `INITIAL_NEXT_WALL_ID`, `MM_PER_WORLD`, `ANGLE_SNAP_ANGLES`.
- Short local type aliases use PascalCase: `Px`, `ToolMode`.
- Private module-level mutable counters are prefixed `_`: `let _nextId = INITIAL_NEXT_WALL_ID` in `useUIStore.ts`.

**Types:**
- All exported type aliases are PascalCase: `EngineCommand`, `ECSSnapshot`, `WallSnapshot`, `CreateWallOptions`, `DispatcherDeps`.
- Snapshot types use `Snapshot` suffix: `NodeSnapshot`, `WallSnapshot`, `RoomSnapshot`, `DimensionSnapshot`, `AngleDimensionSnapshot`, `NodeCapSnapshot`.
- React props types use `Props` suffix (or local `Props`): `PlanView2DProps`, `Props` in `WallPropertiesPanel.tsx`.
- Zustand store state types use `State` suffix: `UIState`.
- Option bags use `Options` suffix: `CreateWallOptions`.
- Discriminated union `type` field uses `SCREAMING_SNAKE_CASE` verb-noun: `"ENSURE_NODE"`, `"ADD_WALL"`, `"MOVE_NODE"`, `"REMOVE_WALL"`, `"MERGE_NODE"`, `"SPLIT_WALL"`, `"RESOLVE_INTERSECTIONS"`, `"UPDATE_WALL"`.
- Custom DOM event channels use lowercase `tinyhome:<action>` — `"tinyhome:nav"`, `"tinyhome:toggleMode"`.

## Code Style

**Indentation & whitespace:**
- 4-space indentation across all `.ts`/`.tsx` files (e.g., `src/engine/ecs/World.ts`, `src/app/pages/EditorPage.tsx`).
- LF line endings.
- Opening braces on the same line as the declaration (K&R).

**Quotes:**
- Double quotes for string literals in `.ts` / `.tsx`: `import { World } from "src/engine/ecs/World"`, `console.warn("ADD_WALL: …")`.
- Exception: a few legacy/top-level files (`main.tsx`, `App.tsx`) keep single quotes from the Vite template.

**Trailing commas:**
- Multi-line object literals, arrays, and parameter lists carry trailing commas (see `CreateWallOptions` in `src/engine/game/WallFactory.ts`, the `T` token object in `src/app/constants/designTokens.ts`).

**Semicolons:**
- Always required. No reliance on ASI.

**JSX:**
- React 19 with the automatic runtime — files never `import React`.
- Components are `export default function ComponentName() { … }` (named function), e.g. `EditorPage`, `PlanView2D`, `WallPropertiesPanel`.
- Inline `style={{ … }}` objects for layout / positioning (see `EditorPage.tsx`).
- Tailwind utility classes for visual styling (`WallPropertiesPanel.tsx`).
- Konva components (`Stage`, `Layer`, `Line`, `Circle`, `Arc`, `Arrow`, `Text`, `Group`, `Rect`) imported from `react-konva` (see `PlanView2D.tsx`).

**Suppression patterns:**
- Unused params silenced with a leading underscore: `override update(_world: World, _dt: number): void {}` (`src/engine/systems/InputSystem.ts`, `src/engine/ecs/System.ts`).
- `void expr;` to discard values and satisfy `noUnusedLocals` / `noUnusedParameters`: `void world; void deltaTime;` (in `src/engine/ecs/System.ts`).
- `override` keyword used on no-op `update` implementations (`InputSystem.update`).

**`as const`:**
- Used on token / shortcut tables to preserve literal types: `T` in `designTokens.ts`, `ANGLE_SNAP_ANGLES` in `PlanView2D.tsx`.

## Import Conventions

- **Always use the `src/` path alias.** Relative imports (`../../`) are not used inside `src/`. Example:

  ```ts
  import { World } from "src/engine/ecs/World";
  import { useUIStore } from "src/app/store/useUIStore";
  ```

- **`import type` is mandatory for type-only imports** because `verbatimModuleSyntax: true`:

  ```ts
  import type { EngineCommand } from "src/engine/commands/EngineCommands";
  import type { ECSSnapshot, NodeSnapshot } from "src/engine/events/EngineEvents";
  ```

- **Three.js uses a namespace import:** `import * as THREE from "three"` (every engine file that touches Three.js).
- **No barrel files / `index.ts` re-exports.** Imports reference the exact source file.
- **Typical import order inside an engine file:**
  1. `three` namespace import.
  2. ECS core (`src/engine/ecs/*`).
  3. Components (`src/engine/components/*`).
  4. Systems (`src/engine/systems/*`) or graph / utils.
  5. App-layer imports (`src/app/*`).
- **One legacy re-export shim exists:** `src/app/store/useWallStore.ts` re-exports `useFloorPlanStore` under the old name and is marked `@deprecated`.
- **`.tsx` extensions appear explicitly in imports** when needed by `allowImportingTsExtensions` (e.g., `import App from 'src/App.tsx'` in `main.tsx`).

## ECS Component Structure

**Pattern:** Data-only classes extending the abstract `Component` base at `src/engine/ecs/Component.ts` (which is literally `export abstract class Component {}` — no fields, no methods).

Example from `src/engine/components/Transform.ts`:

```ts
import { Component } from "src/engine/ecs/Component";

export class Transform extends Component {
    x: number;
    y: number;
    z: number;
    rotY: number;

    constructor(x = 0, y = 0, z = 0, rotY = 0) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
        this.rotY = rotY;
    }
}
```

**Rules:**
- Components contain **only data fields** — no methods, no behavior.
- All fields are public (no `private` / `readonly` modifiers on component data).
- Constructor uses positional or option-bag params, always calls `super()`.
- Default parameter values are used where sensible (`x = 0`, `rotY = 0`).
- One component class per file; the file name matches the class name exactly.

**Components currently in `src/engine/components/`:**
`AmbientLightComponent.ts`, `AutoAlign.ts`, `CameraOrbit.ts`, `ColliderAABB.ts`, `DirectionalLightComponent.ts`, `Draggable.ts`, `DynamicBody.ts`, `Grounded.ts`, `LightHandle.ts`, `Mesh.ts`, `RoomGeometry.ts`, `Selectable.ts`, `SnapToGrid.ts`, `StaticBody.ts`, `Transform.ts`, `WallEndpoints.ts`, `WallNodes.ts`, `WallPolygon.ts`, `WallSize.ts`, `WallTag.ts`.

## ECS System Structure

**Pattern:** Logic classes extending the abstract `System` base at `src/engine/ecs/System.ts`. The base provides a default no-op `update(world, deltaTime)` that immediately discards both params with `void`.

Reference shape (see `src/engine/systems/RenderSystem.ts`, `InputSystem.ts`):

```ts
export class InputSystem extends System {
    private readonly handler: (e: KeyboardEvent) => void;

    constructor() {
        super();
        this.handler = (e) => { /* … */ };
        window.addEventListener("keydown", this.handler);
    }

    override update(_world: World, _dt: number): void {}

    dispose(): void {
        window.removeEventListener("keydown", this.handler);
    }
}
```

**Rules:**
- All per-frame logic lives in `update(world, deltaTime)`, called from `World.update()` (`src/engine/ecs/World.ts`).
- Event-driven systems with no per-frame work use `override update(_world: World, _dt: number): void {}`.
- Systems that subscribe to DOM events, Three.js controls, or rapier worlds **must implement `dispose()`**, which is called from `engineInstance.dispose()` in `src/engine/engine.ts`.
- Private fields hold constructor-injected Three.js / world deps.
- Entity queries go through `Query.entitiesWith(world, ComponentA, ComponentB)` (`src/engine/ecs/Query.ts`).
- The `World` API the systems rely on (from `src/engine/ecs/World.ts`): `createEntity`, `destroyEntity`, `addComponent`, `removeComponent`, `getComponent`, `hasComponent`, `getEntityIds`, `addSystem`, `update`.

**Systems currently in `src/engine/systems/`:**
`CannonCollisionSystem.ts`, `DimensionSystem.ts`, `GizmoSystem.ts`, `GroundSystem.ts`, `InputSystem.ts`, `LightSystem.ts`, `OrbitControlSystem.ts`, `PlacementAssistSystem.ts`, `RenderSystem.ts`, `RoomSystem.ts`, `SnapshotSystem.ts`, `WallGeometrySystem.ts`.

## Factory Function Structure

**Pattern:** Plain exported functions (not classes) that compose entities in the `World` and add Three.js objects to the `scene`.

Reference shape from `src/engine/game/WallFactory.ts`:

```ts
export type CreateWallOptions = {
    wallId?: number;
    startNodeId: number;
    endNodeId: number;
    cx?: number; cy?: number; cz?: number;
    length?: number;
    height?: number;
    thickness: number;
    color?: number;
};

export function createWall(world: World, scene: THREE.Scene, opts: CreateWallOptions): number {
    const { wallId, startNodeId, endNodeId, cx = 0, cy = 0.5, cz = 0,
            length = 1, height = 1, thickness, color = 0xcccccc } = opts;

    const entity = world.createEntity();
    // … create geometry/material/mesh, scene.add(mesh)
    world.addComponent(entity, new Transform(cx, cy, cz, 0));
    world.addComponent(entity, new Mesh(mesh));
    // … more components
    if (wallId !== undefined) world.addComponent(entity, new WallTag(wallId));
    return entity;
}
```

**Rules:**
- Function name starts with `create`.
- Always returns the entity ID (`number`).
- Three.js side-effects (`scene.add(mesh)`) happen inline.
- Destructure `opts` with defaults at the top.
- Files in `src/engine/game/`: `WallFactory.ts`, `LightFactory.ts`, `GroundFactory.ts`.

## React Component Structure

Reference shape (see `src/app/pages/EditorPage.tsx`, `src/app/components/editor/PlanView2D.tsx`):

```tsx
type PlanView2DProps = {
    toolMode?: ToolMode;
    onToolModeChange?: (mode: ToolMode) => void;
};

export default function PlanView2D({ toolMode, onToolModeChange }: PlanView2DProps = {}) {
    // 1. Zustand store selectors  — inline selector, never destructure store
    const viewportWidth = useUIStore(s => s.viewportWidth);
    // 2. useState
    const [stageScale, setStageScale] = useState(1);
    // 3. useRef
    const previewLineRef = useRef<any>(null);
    // 4. useMemo derived state
    const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    // 5. useEffect side-effects (each effect returns its own cleanup)
    useEffect(() => { /* … */ return () => cleanup(); }, [deps]);
    // 6. Local handler functions  — `function` declarations, not arrow consts
    function handlePointerDown() { /* … */ }
    // 7. return JSX
    return ( /* … */ );
}
```

**Rules:**
- **Always `export default function ComponentName()`** — a named function declaration, never an arrow component. This keeps the `react-refresh/only-export-components` rule happy.
- Props types are declared as a `type` alias (not `interface`) immediately above the component (`type Props = …` or `type ComponentNameProps = …`).
- Zustand stores are accessed via an inline selector: `useUIStore(s => s.field)`. The whole store is never destructured (avoids over-subscribing).
- `useEffect` cleanup returns the unsubscribe / `removeEventListener` directly. Engine event subscriptions reuse the return value of `events.on(...)` as the cleanup (see `useFloorPlanStore.ts`).
- `useMemo` is used for expensive derived data — `Map` lookups by id, polygon math, filtered arrays from snapshot data.
- Inline `style={{ … }}` for absolute positioning / layout; Tailwind utility classes (`bg-surface-container/90`, `font-headline-sm`, etc.) for theming.
- React 19 + the automatic JSX runtime — no `import React from "react"`.

## Zustand Store Structure

Reference shape from `src/app/store/useUIStore.ts`:

```ts
type UIState = {
    isSidebarOpen: boolean;
    openSidebar: () => void;
    toggleSidebar: () => void;

    viewportWidth: number;
    viewportHeight: number;
    syncViewport: (width: number, height: number) => void;

    getAndIncrementNextWallId: () => number;
};

export const useUIStore = create<UIState>((set, get) => ({
    isSidebarOpen: false,
    openSidebar: () => set({ isSidebarOpen: true }),
    toggleSidebar: () => set(s => ({ isSidebarOpen: !s.isSidebarOpen })),

    viewportWidth:  typeof window !== "undefined" ? window.innerWidth  : 1280,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 720,

    syncViewport: (width, height) => {
        const { viewportWidth, viewportHeight } = get();
        if (viewportWidth === width && viewportHeight === height) return; // equality guard
        set({ viewportWidth: width, viewportHeight: height });
    },

    getAndIncrementNextWallId: (() => {
        let _nextId = INITIAL_NEXT_WALL_ID;
        return () => _nextId++;
    })(),
}));
```

**Rules:**
- State is described by a single `type <Store>State` alias defined directly above the `create<…>(…)` call.
- Actions live alongside the state fields on the same object.
- Setters that touch existing state read via `get()` first and **return early on equality** to prevent gratuitous re-renders (`syncViewport`).
- Private mutable counters are kept in a closure, not on the store surface (`getAndIncrementNextWallId`).
- Initial values that depend on `window` are guarded by `typeof window !== "undefined"`.

**Stores in `src/app/store/`:**
- `useUIStore.ts` — sidebar, viewport, wall-id counter.
- `useFloorPlanStore.ts` — a hook (not a real Zustand store) that subscribes to ECS snapshots and returns Konva-space 2D data. Uses `useState` + `useEffect` + `useMemo`, not `create()`.
- `useWallStore.ts` — deprecated re-export shim around `useFloorPlanStore`.
- `useEditorStore.ts` — entire body commented out; dead code.

## Command / Event Patterns

**Commands (UI → Engine):**
- Discriminated union in `src/engine/commands/EngineCommands.ts` — data shapes only, no logic.
- `type` field uses SCREAMING_SNAKE_CASE verb-noun: `ADD_WALL`, `MOVE_NODE`, `SPLIT_WALL`, `RESOLVE_INTERSECTIONS`, `UPDATE_WALL`, etc.
- Dispatched from React via `window.gameEngine.api.dispatch(command)`. A small local helper in `PlanView2D.tsx` guards the global:

  ```ts
  function dispatch(cmd: EngineCommand) {
      if (!window.gameEngine) {
          console.warn("[PlanView2D] dispatch called before engine init:", cmd.type);
          return;
      }
      window.gameEngine.api.dispatch(cmd);
  }
  ```

- Handled by `createDispatcher(deps)` in `src/engine/commands/dispatcher.ts` via a single `switch (command.type)`; each case is wrapped in `{ … break; }` to satisfy `noFallthroughCasesInSwitch`.

**Events (Engine → UI):**
- Typed event bus in `src/engine/events/EngineEvents.ts`.
- Subscribe with `engine.api.events.on(channel, handler)` — returns the unsubscribe function, which React effects return directly as cleanup.
- `EngineEvents.lastSnapshot` caches the most recent `ECSSnapshot` so newly-mounted components (e.g., `useFloorPlanStore`) can do a cold-start read.
- DOM custom events for keyboard shortcuts are fired by `InputSystem` on `window` under the `tinyhome:*` namespace; they're typed via `declare global { interface WindowEventMap { … } }` in `src/engine/systems/InputSystem.ts`.
- The global `window.gameEngine` is typed via a declaration merge in `src/engine/engineTypes.ts`.

## Error Handling

- **Console logging for non-fatal engine state issues:**
  - `console.warn(...)` in `src/engine/commands/dispatcher.ts` for missing nodes / duplicate wall pairs.
  - `console.warn(...)` in `src/app/components/editor/PlanView2D.tsx` for dispatch-before-init.
  - There is no project-wide logger — bare `console` is the convention.
- **Early-return / `break` guards** for missing entities or nodes instead of throwing (see every case in `dispatcher.ts`).
- **`??` nullish coalescing** for optional chain fallbacks (e.g., `engine.api.events.lastSnapshot ?? null`).
- **Non-null assertion `!`** is reserved for cases where existence is guaranteed (e.g., `document.getElementById("root")!` in `main.tsx`).
- **`try / catch` is rare** — only `src/engine/graph/NodeRegistry.ts` and `src/engine/systems/CannonCollisionSystem.ts` use it; everywhere else, errors surface as `console.warn` or silent no-ops.
- **`void expr;`** is used to satisfy `noUnusedLocals` / `noUnusedParameters` when a value must be discarded (`void deltaTime;`, `void world;`).

## Comments

- Vietnamese-language comments are common throughout the engine layer (the developer's native language) — see `src/engine/ecs/System.ts`, `src/engine/ecs/Query.ts`, `src/engine/commands/EngineCommands.ts`, `src/engine/systems/InputSystem.ts`.
- English is used for architectural decisions, algorithm explanations, and magic-constant annotations (`// 1m = 100px`, `// 150mm default → 15px` in `PlanView2D.tsx`).
- JSDoc blocks are placed on abstract base classes (`Component`, `System`), command variants in `EngineCommands.ts`, and snapshot types in `EngineEvents.ts`.
- ASCII section dividers (`// ─── … ───`, `// ===== … =====`) are used inside longer files (`PlanView2D.tsx`, `useFloorPlanStore.ts`) to group helpers/types/effects.
- Commented-out dead code is left in source rather than deleted (`src/app/store/useEditorStore.ts` is entirely commented out; `src/app/engine/engineBridge.ts` is fully commented; one `<Route>` line is commented in `src/app/routes/Routes.tsx`).

## Function Design

- File-local helpers are placed at the top of a file as `function name(...)` declarations (e.g., `nodeToPx`, `wallToPx`, `computePolygonCentroid` in `useFloorPlanStore.ts`).
- Arrow functions are used for callbacks, Zustand actions, and `useEffect` handlers.
- Option-bag parameters (`opts: CreateWallOptions`) are preferred over long positional lists in factories.
- Public functions are explicitly typed with both parameter types and return type, even when inferable (see `createDispatcher` in `dispatcher.ts`).

## Module Design

- Each module exports either one default React component (`export default function …`) or one or more named exports — never both, to keep `react-refresh/only-export-components` clean.
- Setup modules (`src/engine/setup/*`) export `create…`/`init…` functions; the entrypoint `src/engine/engine.ts` re-exports types/constants from them so existing imports keep working.
- No central `index.ts` barrel files anywhere.

---

*Convention analysis: 2026-05-14*
