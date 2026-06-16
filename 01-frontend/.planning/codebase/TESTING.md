# Testing Patterns

**Analysis Date:** 2026-05-13

## Test Framework

**No test framework is installed.**

Evidence:
- `package.json` contains no test runner dependency (no Vitest, Jest, Mocha, or equivalent)
- `package.json` scripts section has no `test` script -- only `dev`, `build`, `lint`, `preview`
- No `vitest.config.*` or `jest.config.*` file exists in the project root
- No `*.test.*` or `*.spec.*` files exist anywhere under `src/`
- The only test files found in the repo are inside `node_modules/zod/` (a dependency, not project tests)

## Test File Inventory

Project test files under `src/`: **none**

Verified by globbing for `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` under `src/` -- zero results.

## Gap Assessment

**CRITICAL GAP: Zero test coverage across the entire codebase.**

High-value, testable units with no tests:

**ECS Core (`src/engine/ecs/`):**
- `World.ts` -- entity lifecycle, component add/remove/get, system update loop
- `Query.ts` -- `entitiesWith()` filtering across multiple component types

**ECS Systems (`src/engine/systems/`):**
- `WallGeometrySystem.ts` -- miter geometry calculations, complex and regression-prone
- `RoomSystem.ts` -- room detection graph traversal
- `DimensionSystem.ts` -- dimension annotation math
- `SnapshotSystem.ts` -- ECS-to-snapshot serialization

**Command Dispatcher (`src/engine/commands/dispatcher.ts`):**
- All 7 command types: ENSURE_NODE, MOVE_NODE, ADD_WALL, REMOVE_WALL, MERGE_NODE, SPLIT_WALL, RESOLVE_INTERSECTIONS
- RESOLVE_INTERSECTIONS algorithm is the most complex untested logic in the codebase

**Graph/Topology (`src/engine/graph/`):**
- `NodeRegistry.ts` -- node CRUD, wall connection tracking
- `RoomDetection.ts` -- cycle detection algorithm

**Store Logic (`src/app/store/`):**
- `useFloorPlanStore.ts` -- world-to-px coordinate conversion math, polygon centroid calculation
- `useUIStore.ts` -- viewport sync equality guard

**Utility Helpers (`src/engine/utils/`):**
- `wallHelpers.ts` -- AABB recomputation helpers

## Recommended Setup

Vite is the bundler, so **Vitest** is the natural choice (zero-config with Vite, same transform pipeline).

**Install:**
```bash
npm install --save-dev vitest @vitest/ui
```

**Add scripts to `package.json`:**
```json
{
  "scripts": {
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:ui":       "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Create `vitest.config.ts` at project root:**
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",   // ECS engine has no DOM dependency
        globals: true,
    },
    resolve: {
        alias: { src: path.resolve(__dirname, "src") },
    },
});
```

## Recommended Test File Location

Co-locate test files alongside source files using the `.test.ts` suffix:

```
src/
  engine/
    ecs/
      World.ts
      World.test.ts          <-- co-located unit test
      Query.ts
      Query.test.ts
    commands/
      dispatcher.ts
      dispatcher.test.ts     <-- highest priority
    graph/
      NodeRegistry.ts
      NodeRegistry.test.ts
```

## Recommended Test Patterns

**ECS World unit test (example structure):**
```typescript
import { describe, it, expect } from "vitest";
import { World } from "src/engine/ecs/World";
import { Transform } from "src/engine/components/Transform";

describe("World", () => {
    it("creates unique entity IDs", () => {
        const world = new World();
        const id1 = world.createEntity();
        const id2 = world.createEntity();
        expect(id1).not.toBe(id2);
    });

    it("retrieves an added component", () => {
        const world = new World();
        const entity = world.createEntity();
        world.addComponent(entity, new Transform(1, 2, 3));
        const transform = world.getComponent(entity, Transform);
        expect(transform?.x).toBe(1);
    });

    it("removes component correctly", () => {
        const world = new World();
        const entity = world.createEntity();
        world.addComponent(entity, new Transform());
        world.removeComponent(entity, Transform);
        expect(world.hasComponent(entity, Transform)).toBe(false);
    });
}); 
```

**Dispatcher test (mock THREE.Scene to avoid WebGL):**
```typescript
import { describe, it, expect, vi } from "vitest";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { createDispatcher } from "src/engine/commands/dispatcher";

const mockScene = { add: vi.fn(), remove: vi.fn() } as any;

describe("dispatcher", () => {
    it("ADD_WALL creates wall entity and registers it", () => {
        const world = new World();
        const nodeRegistry = new NodeRegistry();
        const wallEntityByWallId = new Map<number, number>();
        const maxWallIdRef = { value: 0 };
        const dispatch = createDispatcher({ world, scene: mockScene, nodeRegistry, wallEntityByWallId, maxWallIdRef });
        dispatch({ type: "ENSURE_NODE", nodeId: 0, x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: 1, x: 1, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: 1, startNodeId: 0, endNodeId: 1, thickness: 0.15 });
        expect(wallEntityByWallId.has(1)).toBe(true);
    });
}); 
```

**Mocking `window.gameEngine` for React component tests:**
```typescript
vi.stubGlobal("gameEngine", {
    api: {
        dispatch: vi.fn(),
        events: { on: vi.fn(() => vi.fn()), lastSnapshot: null },
        getNextIds: vi.fn(() => ({ nodeId: 1, wallId: 1 })),
    },
    nodes: { nextAvailableNodeId: vi.fn(() => 1) },
});
```

## Coverage

**Current coverage: 0%** -- no tests exist.

Recommended minimum targets once testing is established:
- `src/engine/ecs/`: 90%+ (pure logic, no external dependencies)
- `src/engine/commands/dispatcher.ts`: 80%+ (complex branching, critical correctness)
- `src/engine/graph/`: 80%+ (topology algorithms)
- `src/app/store/useFloorPlanStore.ts`: 70%+ (coordinate conversion math)

## Priority Test Targets

Ordered by risk/complexity:

1. `src/engine/commands/dispatcher.ts` -- RESOLVE_INTERSECTIONS: complex math, highest regression risk
2. `src/engine/ecs/World.ts` and `src/engine/ecs/Query.ts` -- ECS core: everything depends on this
3. `src/engine/graph/NodeRegistry.ts` -- wall topology: MERGE_NODE and SPLIT_WALL correctness
4. `src/app/store/useFloorPlanStore.ts` -- coordinate math: polygon centroid, world-to-px conversions
5. `src/engine/graph/RoomDetection.ts` -- cycle detection and room area calculation

---

*Testing analysis: 2026-05-13*
