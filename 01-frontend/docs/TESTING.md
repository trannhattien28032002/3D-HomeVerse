<!-- generated-by: gsd-doc-writer -->
# Testing

## Current State

There are no automated tests in this project yet. No test runner, no test files, and no test-related dependencies exist in `package.json`.

The primary correctness safety net today consists of:

- **TypeScript** (`typescript ~6.0.2`) — strict compilation catches type errors, unreachable branches, unused locals and parameters (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are all enabled in `tsconfig.app.json`)
- **ESLint** (`eslint ^9.39.4`) with `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` — catches hook misuse, exhaustive deps violations, and React-refresh compatibility issues

Run either check manually:

```bash
# Type-check only (no emit)
npx tsc -b --noEmit

# Lint
npm run lint
```

These checks catch a broad class of bugs at authoring time but do not replace runtime behavior tests on the ECS, command dispatcher, or React layer.

---

## Recommended Test Setup: Vitest

[Vitest](https://vitest.dev) is the natural choice for this project. It reuses the existing `vite.config.ts` directly, supports the `src/*` path alias already configured, understands ESM natively, and has a compatible API surface with Jest (so documentation is transferable).

### Install

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

| Package | Purpose |
|---|---|
| `vitest` | Test runner and assertion library |
| `@vitest/ui` | Browser-based test result UI (optional) |
| `jsdom` | DOM environment for React component tests |
| `@testing-library/react` | React component rendering utilities |
| `@testing-library/jest-dom` | Custom matchers (`.toBeInTheDocument()`, etc.) |
| `@testing-library/user-event` | Simulates real user interactions |

### Vitest Config

Add a `vitest.config.ts` at the project root alongside `vite.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
});
```

The `src` alias mirrors the one in `vite.config.ts` so all existing `import ... from "src/engine/..."` paths resolve correctly inside tests without modification.

### Global Setup File

Create `src/test/setup.ts`:

```ts
// src/test/setup.ts
import '@testing-library/jest-dom';
```

### Add npm Scripts

Add to `package.json` `scripts`:

```json
{
  "scripts": {
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:ui":    "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## What to Test First: ECS Primitives

The ECS core (`src/engine/ecs/`) is pure TypeScript with zero external dependencies — no DOM, no Three.js, no canvas. It is the highest-value testing target because:

1. It is the foundation everything else depends on.
2. Tests are fast and completely deterministic.
3. No mocks are needed.

### Test File Placement

Follow the `*.test.ts` convention co-located with the source file:

```
src/engine/ecs/World.test.ts
src/engine/ecs/Query.test.ts
src/engine/graph/NodeRegistry.test.ts
src/engine/commands/dispatcher.test.ts
src/engine/systems/DimensionSystem.test.ts
```

### Sample: World and Query Unit Tests

```ts
// src/engine/ecs/World.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from 'src/engine/ecs/World';
import { Component } from 'src/engine/ecs/Component';
import { Query } from 'src/engine/ecs/Query';

class Position extends Component {
  constructor(public x = 0, public z = 0) { super(); }
}

class Tag extends Component {}

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('creates entities with incrementing IDs', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    expect(b).toBe(a + 1);
  });

  it('adds and retrieves a component', () => {
    const entity = world.createEntity();
    world.addComponent(entity, new Position(3, 7));
    const pos = world.getComponent(entity, Position);
    expect(pos?.x).toBe(3);
    expect(pos?.z).toBe(7);
  });

  it('reports hasComponent correctly', () => {
    const entity = world.createEntity();
    expect(world.hasComponent(entity, Position)).toBe(false);
    world.addComponent(entity, new Position());
    expect(world.hasComponent(entity, Position)).toBe(true);
  });

  it('removes a component', () => {
    const entity = world.createEntity();
    world.addComponent(entity, new Position());
    world.removeComponent(entity, Position);
    expect(world.hasComponent(entity, Position)).toBe(false);
  });

  it('destroys an entity and cleans up all its components', () => {
    const entity = world.createEntity();
    world.addComponent(entity, new Position(1, 2));
    world.addComponent(entity, new Tag());
    world.destroyEntity(entity);
    expect(world.hasComponent(entity, Position)).toBe(false);
    expect(world.hasComponent(entity, Tag)).toBe(false);
  });
});

describe('Query.entitiesWith', () => {
  it('returns only entities that have all required components', () => {
    const world = new World();
    const withBoth = world.createEntity();
    const withOne  = world.createEntity();
    const withNone = world.createEntity();

    world.addComponent(withBoth, new Position());
    world.addComponent(withBoth, new Tag());
    world.addComponent(withOne, new Position());

    void withNone; // intentionally empty

    const result = Query.entitiesWith(world, Position, Tag);
    expect(result).toContain(withBoth);
    expect(result).not.toContain(withOne);
    expect(result).not.toContain(withNone);
  });

  it('returns an empty array when no entities match', () => {
    const world = new World();
    world.createEntity();
    expect(Query.entitiesWith(world, Tag)).toHaveLength(0);
  });
});
```

### Sample: DimensionSystem Unit Test

`DimensionSystem` (`src/engine/systems/DimensionSystem.ts`) is a pure system — it reads from `World` and `NodeRegistry` and writes to `lastDimensions`. It requires no Three.js objects.

```ts
// src/engine/systems/DimensionSystem.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from 'src/engine/ecs/World';
import { NodeRegistry } from 'src/engine/graph/NodeRegistry';
import { DimensionSystem } from 'src/engine/systems/DimensionSystem';
import { WallTag } from 'src/engine/components/WallTag';
import { WallNodes } from 'src/engine/components/WallNodes';

function makeWallEntity(
  world: World,
  nodes: NodeRegistry,
  wallId: number,
  x1: number, z1: number,
  x2: number, z2: number,
  thickness = 0.2,
): void {
  const startNodeId = nodes.createNode(x1, z1);
  const endNodeId   = nodes.createNode(x2, z2);
  const entity = world.createEntity();
  world.addComponent(entity, new WallTag(wallId));
  world.addComponent(entity, new WallNodes(startNodeId, endNodeId, thickness));
}

describe('DimensionSystem', () => {
  let world: World;
  let nodes: NodeRegistry;
  let system: DimensionSystem;

  beforeEach(() => {
    world  = new World();
    nodes  = new NodeRegistry();
    system = new DimensionSystem(nodes);
  });

  it('computes wall length correctly', () => {
    makeWallEntity(world, nodes, 1, 0, 0, 3, 4); // 3-4-5 triangle → length 5
    system.update(world);
    expect(system.lastDimensions).toHaveLength(1);
    expect(system.lastDimensions[0].length).toBeCloseTo(5, 5);
  });

  it('skips degenerate walls with length < 0.01', () => {
    makeWallEntity(world, nodes, 1, 0, 0, 0, 0.005);
    system.update(world);
    expect(system.lastDimensions).toHaveLength(0);
  });

  it('emits perpendicular unit vector pointing left of travel direction', () => {
    makeWallEntity(world, nodes, 1, 0, 0, 1, 0); // wall along +X axis
    system.update(world);
    const dim = system.lastDimensions[0];
    // perpX = -uz = 0, perpZ = ux = 1 for a wall travelling in +X
    expect(dim.perpX).toBeCloseTo(0, 5);
    expect(dim.perpZ).toBeCloseTo(1, 5);
  });
});
```

---

## Testing the Command Dispatcher

The dispatcher (`src/engine/commands/dispatcher.ts`) depends on `World`, `NodeRegistry`, `THREE.Scene`, `MeshRegistry`, and `MaterialRegistry`. Three.js objects (`Scene`, `Mesh`) are the only external dependency — mock them minimally.

```ts
// src/engine/commands/dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { World } from 'src/engine/ecs/World';
import { NodeRegistry } from 'src/engine/graph/NodeRegistry';
import { createDispatcher } from 'src/engine/commands/dispatcher';

// Minimal Three.js scene mock — only the methods the dispatcher calls
const mockScene = {
  add: vi.fn(),
  remove: vi.fn(),
} as unknown as import('three').Scene;

// Minimal registry mocks
const mockMeshRegistry = {
  register: vi.fn(),
  dispose: vi.fn(),
  get: vi.fn(),
} as unknown;

const mockMaterialRegistry = {
  getWallMaterial: vi.fn().mockReturnValue({}),
} as unknown;

function makeDispatcher() {
  const world = new World();
  const nodeRegistry = new NodeRegistry();
  const wallEntityByWallId = new Map<number, number>();
  const maxWallIdRef = { value: 0 };

  const dispatch = createDispatcher({
    world,
    scene: mockScene,
    nodeRegistry,
    wallEntityByWallId,
    maxWallIdRef,
    meshRegistry: mockMeshRegistry as never,
    materialRegistry: mockMaterialRegistry as never,
  });

  return { world, nodeRegistry, wallEntityByWallId, maxWallIdRef, dispatch };
}

describe('ENSURE_NODE', () => {
  it('creates a node in the registry at the given position', () => {
    const { nodeRegistry, dispatch } = makeDispatcher();
    dispatch({ type: 'ENSURE_NODE', nodeId: 1, x: 2, z: 4 });
    const node = nodeRegistry.get(1);
    expect(node?.x).toBe(2);
    expect(node?.z).toBe(4);
  });
});

describe('ADD_WALL then REMOVE_WALL', () => {
  it('registers a wall entity and then destroys it', () => {
    const { wallEntityByWallId, dispatch } = makeDispatcher();

    dispatch({ type: 'ENSURE_NODE', nodeId: 1, x: 0, z: 0 });
    dispatch({ type: 'ENSURE_NODE', nodeId: 2, x: 5, z: 0 });
    dispatch({ type: 'ADD_WALL', wallId: 1, startNodeId: 1, endNodeId: 2, thickness: 0.2 });

    expect(wallEntityByWallId.has(1)).toBe(true);

    dispatch({ type: 'REMOVE_WALL', wallId: 1 });
    expect(wallEntityByWallId.has(1)).toBe(false);
  });
});
```

---

## Testing the React Layer

Use React Testing Library to test UI components against behaviour, not implementation.

### Mocking `window.gameEngine`

Components that call `window.gameEngine?.api.dispatch(...)` require the global to be present. Set it up in a test helper:

```ts
// src/test/mockEngine.ts
import { vi } from 'vitest';
import type { EngineInstance } from 'src/engine/engineTypes';

export function installMockEngine(): EngineInstance {
  const mockEngine: EngineInstance = {
    world: {} as never,
    nodes: {} as never,
    wallEntityByWallId: new Map(),
    dispose: vi.fn(),
    api: {
      events:            {} as never,
      dispatch:          vi.fn(),
      clampNodeMove:     vi.fn().mockReturnValue({ x: 0, z: 0 }),
      getNextIds:        vi.fn().mockReturnValue({ nodeId: 1, wallId: 1 }),
      setView:           vi.fn(),
      rotateView:        vi.fn(),
      transaction:       vi.fn((_, fn: () => void) => fn()),
      beginTransaction:  vi.fn(),
      commitTransaction: vi.fn(),
      cancelTransaction: vi.fn(),
      undo:              vi.fn(),
      redo:              vi.fn(),
      canUndo:           vi.fn().mockReturnValue(false),
      canRedo:           vi.fn().mockReturnValue(false),
    },
  };
  window.gameEngine = mockEngine;
  return mockEngine;
}

export function removeMockEngine(): void {
  delete window.gameEngine;
}
```

Use it in a component test:

```tsx
// src/app/components/editor/SomePanel.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { installMockEngine, removeMockEngine } from 'src/test/mockEngine';
import { SomePanel } from './SomePanel';

describe('SomePanel', () => {
  let engine: ReturnType<typeof installMockEngine>;

  beforeEach(() => { engine = installMockEngine(); });
  afterEach(() => { removeMockEngine(); });

  it('dispatches REMOVE_WALL when the delete button is clicked', async () => {
    render(<SomePanel wallId={42} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(engine.api.dispatch).toHaveBeenCalledWith({ type: 'REMOVE_WALL', wallId: 42 });
  });
});
```

### Mocking Zustand Stores

Zustand stores (`useFloorPlanStore`, `useWallStore`, `useUIStore`) are plain functions and can be stubbed with `vi.mock`:

```ts
vi.mock('src/app/store/useFloorPlanStore', () => ({
  useFloorPlanStore: () => ({
    walls: [],
    nodes: [],
  }),
}));
```

---

## What NOT to Test

Avoid writing tests for the following — the cost of mocking far exceeds the benefit:

| Area | Why |
|---|---|
| Three.js rendering internals (`RenderSystem`, `WallGeometrySystem` mesh geometry) | Requires a full WebGL context. JSDOM provides no WebGL. GPU output is not assertable in unit tests. |
| Cannon-es / Rapier physics simulation (`CannonCollisionSystem`, `DynamicBody`) | Physics engines are integration-tested by the physics library authors. Testing collision response requires a running simulation loop. |
| `OrbitControlSystem` camera behaviour | Depends on `THREE.OrbitControls` internal state and mouse event sequences on a real canvas. |
| Konva canvas rendering (`SnapshotSystem` Konva output) | Konva requires a DOM canvas with a real 2D context. JSDOM canvas is a stub that throws on most draw calls. |
| Three.js `Mesh` geometry vertex data | Geometry correctness is a Three.js internal concern; assert wall length and node positions at the ECS level instead. |

For the rendering stack, prefer visual regression tests (e.g., Playwright or Storybook) as a future addition if pixel-level correctness becomes important.

---

## Coverage Requirements

No coverage thresholds are configured. When tests are added, consider targeting the ECS core at high coverage (90%+ lines/branches) because it is pure logic. Keep coverage targets off the rendering systems.

To generate a coverage report once `@vitest/coverage-v8` is installed:

```bash
npm install --save-dev @vitest/coverage-v8
npm run test:coverage
```

---

## CI Integration

No CI pipeline is configured in this repository. When one is added, the recommended test step for GitHub Actions is:

```yaml
- name: Run tests
  run: npm run test
```

Place it after the `npm run lint` step so type and lint errors are surfaced before running tests.
