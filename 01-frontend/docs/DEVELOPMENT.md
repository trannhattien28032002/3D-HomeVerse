<!-- generated-by: gsd-doc-writer -->
# Development Guide — 3D HomeVerse Frontend

## Project Scripts

All scripts are run from `01-frontend/` with npm.

| Command | Description |
|---|---|
| `npm run dev` | Start Vite HMR dev server at `localhost:5173` |
| `npm run build` | Type-check with `tsc -b`, then Vite production bundle |
| `npm run lint` | Run ESLint across the entire `src/` tree |
| `npm run preview` | Serve the last production build locally |

## Codebase Architecture

The codebase is split into two strictly separated layers.

```
src/
├── engine/        # Pure ECS — no React, no app state
│   ├── ecs/       # World, Entity, Component, System, Query primitives
│   ├── components/  # ECS component classes (data only)
│   ├── systems/   # ECS system classes (logic only)
│   ├── game/      # Entity factories (createWall, createAmbientLight, …)
│   ├── commands/  # EngineCommands discriminated union + dispatcher + history
│   ├── events/    # EngineEvents typed event bus + ECSSnapshot types
│   ├── graph/     # NodeRegistry — wall topology source of truth
│   ├── rendering/ # MeshRegistry, MaterialRegistry
│   ├── serialization/ # SceneDocument, serialize / deserialize / validate
│   ├── setup/     # sceneSetup, systemSetup, defaultScene
│   ├── utils/     # Pure helpers (wallHelpers, …)
│   └── engine.ts  # createEngine() entry point
│
└── app/           # React UI — may import from engine/, never the reverse
    ├── components/editor/  # React panels, canvases, tool overlays
    ├── engine/    # EngineContext.tsx, engineBridge.ts
    ├── hooks/     # Custom hooks (useCamelCase.ts)
    ├── pages/     # Route-level page components
    ├── routes/    # AppRoutes, PrivateRoute
    ├── services/  # API / backend services
    ├── store/     # Zustand stores
    └── constants/ # designTokens, navigation
```

### The Layer Constraint

`src/engine/` must **never** import from `src/app/`. Engine-layer files may only
import from:

- `three`
- `cannon-es`
- `@dimforge/rapier3d-compat`
- Other files inside `src/engine/`

Violating this constraint couples the simulation core to React and breaks headless
testing and serialization.

## Import Style

Always use the `src/` path alias — never relative `../` paths.

```ts
// Correct
import { World } from 'src/engine/ecs/World';
import { useUIStore } from 'src/app/store/useUIStore';

// Wrong
import { World } from '../../engine/ecs/World';
```

The alias is configured in `vite.config.*` and `tsconfig.json`.

## Naming Conventions

| Artifact | Convention | Example |
|---|---|---|
| React components | `PascalCase.tsx` | `BuildPanel.tsx` |
| Custom hooks | `useCamelCase.ts` | `useFloorPlanStore.ts` |
| Engine classes | `PascalCase.ts` | `WallGeometrySystem.ts` |
| Helper functions | `camelCase.ts` | `wallHelpers.ts` |
| Constants | `UPPER_SNAKE_CASE` | `INITIAL_NEXT_WALL_ID` |
| Directories | lowercase single word | `components/`, `systems/` |

## How to Add Each Type of Artifact

### React Component

1. Create `src/app/components/editor/MyPanel.tsx` — PascalCase, default export.
2. Wire it into `src/app/pages/EditorPage.tsx` (or the relevant page).

```tsx
// src/app/components/editor/MyPanel.tsx
type Props = { /* … */ };

export default function MyPanel({ /* … */ }: Props) {
    return <div>…</div>;
}
```

### Page and Route

1. Create `src/app/pages/MyPage.tsx` — PascalCase, default export.
2. Register the route in `src/app/routes/Routes.tsx`:

```tsx
import MyPage from 'src/app/pages/MyPage';

// Inside <RouterRoutes>:
<Route path="/my-path" element={<MyPage />} />
```

### ECS Component

Create `src/engine/components/MyComponent.ts` extending `Component`. Components
hold **data only** — no methods with logic.

```ts
import { Component } from 'src/engine/ecs/Component';

export class MyComponent extends Component {
    value: number;
    constructor(value: number) {
        super();
        this.value = value;
    }
}
```

### ECS System

1. Create `src/engine/systems/MySystem.ts` extending `System`.
2. Register it in `src/engine/setup/systemSetup.ts` by calling `world.addSystem(new MySystem())`.
   Insert it **before** `SnapshotSystem` — the snapshot system must always be last.

```ts
import { System } from 'src/engine/ecs/System';
import { World } from 'src/engine/ecs/World';

export class MySystem extends System {
    update(world: World, deltaTime: number): void {
        // query entities and process components
    }
}
```

**System registration order** (enforced in `systemSetup.ts`):

```
OrbitControl → Gizmo → PlacementAssist → Collision →
Light → WallGeometry → Room → Dimension → Render → Snapshot
```

`Snapshot` reads from `Dimension`'s `lastDimensions` / `lastAngleDimensions`, so
`DimensionSystem` must run before `SnapshotSystem`. Any new system that writes data
consumed by `SnapshotSystem` must be registered ahead of it.

### Engine Command

Commands are the only channel through which `src/app/` mutates ECS state.

1. Add a new variant to the `EngineCommand` discriminated union in
   `src/engine/commands/EngineCommands.ts`:

```ts
| { type: "MY_COMMAND"; entityId: number; value: number }
```

2. Add a `case "MY_COMMAND":` handler in `src/engine/commands/dispatcher.ts`.

3. Dispatch from the UI via the engine API:

```ts
const engine = useEngineOrNull();
engine?.api.dispatch({ type: 'MY_COMMAND', entityId: 42, value: 1.5 });
```

For operations that should be undoable, wrap the dispatch in a transaction:

```ts
engine?.api.transaction('My action label', () => {
    engine.api.dispatch({ type: 'MY_COMMAND', entityId: 42, value: 1.5 });
});
```

### Entity Factory

Create `src/engine/game/MyFactory.ts`. A factory creates an entity, attaches
components, and returns the entity ID.

```ts
import * as THREE from 'three';
import { World } from 'src/engine/ecs/World';
import { Transform } from 'src/engine/components/Transform';

export type CreateMyEntityOptions = {
    x: number;
    y: number;
    z: number;
};

export function createMyEntity(world: World, scene: THREE.Scene, opts: CreateMyEntityOptions): number {
    const entity = world.createEntity();
    world.addComponent(entity, new Transform(opts.x, opts.y, opts.z));
    // … add more components
    return entity;
}
```

### Zustand Store

Create `src/app/store/useMyStore.ts` using `create<StateType>()`.

```ts
import { create } from 'zustand';

type MyState = {
    count: number;
    increment: () => void;
};

export const useMyStore = create<MyState>((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
}));
```

### Design Token

Add the value to the `T` object in `src/app/constants/designTokens.ts`:

```ts
export const T = {
    // … existing tokens …
    myNewColor: '#rrggbb',
} as const;
```

Import it wherever the token is needed:

```ts
import { T } from 'src/app/constants/designTokens';

// usage
style={{ color: T.myNewColor }}
```

## Snapshot Data Flow

The snapshot pipeline is the primary mechanism by which the React UI stays
synchronized with ECS state. It runs automatically every frame.

```
ECS mutation via dispatch()
        │
        ▼
  [ WallGeometrySystem ]   — rebuilds wall meshes from NodeRegistry
  [ RoomSystem ]           — detects enclosed room polygons
  [ DimensionSystem ]      — computes per-wall length vectors and corner angles
        │
        ▼
  [ SnapshotSystem ]       — hashes node + wall + cap state;
                             if changed, emits "snapshot" on EngineEvents
        │
        ▼
  EngineEvents.emit("snapshot", snapshot)
  EngineEvents.lastSnapshot = snapshot   ← hot-reload / late-mount catchup
        │
        ▼
  useFloorPlanStore (hook)
    - subscribes via engine.api.events.on("snapshot", setSnap)
    - converts world-space coordinates → Konva pixel-space
    - returns { nodes, walls, caps, rooms, dimensions, angleDimensions }
        │
        ▼
  PlanView2D / Canvas (Konva)
    - renders the 2D floor plan from pixel-space data
```

Key types flowing through the pipeline:

- `ECSSnapshot` — the raw engine payload (`src/engine/events/EngineEvents.ts`)
- `Node2D`, `Wall2D`, `Cap2D`, `Room2D`, `Dimension2D`, `AngleDimension2D` — pixel-space
  types returned by `useFloorPlanStore` (`src/app/store/useFloorPlanStore.ts`)

`SnapshotSystem` uses hash comparison to skip re-emitting when nothing has changed,
preventing unnecessary React re-renders.

## Accessing the Engine from React

The engine instance is provided via React context. Use the hooks from
`src/app/engine/EngineContext.tsx`:

```ts
import { useEngineOrNull, useEngine } from 'src/app/engine/EngineContext';

// In a component that may render before the engine is ready:
const engine = useEngineOrNull(); // returns EngineInstance | null

// In a component guaranteed to render after engine initialization:
const engine = useEngine(); // throws if unavailable
```

The engine is also available on `window.gameEngine` as a debug fallback, but
production code should always use the React context hooks.
