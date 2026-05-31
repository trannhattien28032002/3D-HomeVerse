# Architecture — 3D Interior Design

## Overview

The frontend is structured in three distinct layers:

```
src/
├── shared/          Pure utilities (math, constants, types) — no framework deps
├── engine/          ECS runtime + systems — no React/Konva at import time
└── app/             React UI layer (components, stores, hooks, pages)
```

---

## Layer: `shared/`

Framework-free primitives used by both `engine/` and `app/`.

| Module | Owns |
|---|---|
| `shared/math/coords.ts` | pixel↔metre, world↔plan transforms |
| `shared/math/geometry.ts` | SAT, OBB, segment-segment intersect |
| `shared/constants/placement.ts` | `SNAP_M`, `ROT_STEP_DEG`, `GHOST_OPACITY` |
| `shared/constants/grid.ts` | `GRID_SIZE`, `METER_PX` |
| `shared/types/primitives.ts` | `Vec2`, `Vec3`, `Bounds` |

---

## Layer: `engine/`

Pure TypeScript ECS — no React/Konva/Three.js runtime imported at the module boundary.

### ECS Core

| Module | Role |
|---|---|
| `engine/ecs/World` | Entity registry + component storage |
| `engine/ecs/System` | Base class; `update(world)` called each frame |
| `engine/ecs/Query` | Filter entities by component presence |

### Command System

```
UI dispatch → engine.api.dispatch(cmd)
           → dispatcher.ts (router, switch + delegate)
              ├── handlers/wallHandlers.ts
              ├── handlers/furnitureHandlers.ts
              ├── handlers/selectionHandlers.ts
              └── handlers/sceneHandlers.ts
```

`dispatcher.ts` is a pure router — each case delegates to a handler file. A `default: assertNever(cmd)` compile-guard ensures every command is handled.

### Systems (per-frame)

| System | Responsibility |
|---|---|
| `WallGeometrySystem` | Miter/bevel geometry for wall junctions |
| `CannonCollisionSystem` | 3D AABB physics + sweep CCD |
| `GizmoSystem` | TransformControls for 3D furniture interaction |
| `SnapshotSystem` | Sync ECS state → 2D plan snapshot |
| `FurniturePlacementSystem` | Ghost preview + placement validation |
| `DimensionSystem` | Linear + angular dimension overlays |

### Registries

| Registry | Owns |
|---|---|
| `engine/registries/EntityRegistry` | `disposeEntity(id)` — GC all shadow registries |
| `engine/rendering/MeshRegistry` | Three.js mesh lifecycle |
| `engine/rendering/ModelRegistry` | GLTF model lifecycle |

---

## Layer: `app/`

React UI — imports from both `shared/` and `engine/`.

### State

| Store | Owns |
|---|---|
| `app/store/useUIStore` | Active Zustand store — activeTool2D, panels, selection |
| `app/store/useFloorPlanSnapshot` | Read-only snapshot of ECS state for React rendering |

### Key Components

| Component | Role |
|---|---|
| `PlanView2D/` | Konva 2D floor plan — split into 7 layer sub-components |
| `DecorCatalog/` | Furniture browser modal |
| `SceneView3D` | Three.js canvas wrapper |
| `BottomNavBar` | Tool switcher |

### Tool System

All 2D tools implement `ToolBase`. The `toolRegistry.ts` maps `{id → {tool, icon, shortcut, label}}` — adding a new tool only requires a single registry entry.

---

## Data Flow (command round-trip)

```
User gesture (Konva click / keyboard)
  → usePlanInput.ts → tool.onPointerDown()
  → engine.api.dispatch(EngineCommand)
  → dispatcher.ts → handler (wallHandlers / furnitureHandlers / …)
  → World mutation (add/remove/modify component)
  → SnapshotSystem.update() → useFloorPlanSnapshot() triggers re-render
  → PlanView2D layers re-render with new snapshot
```

---

## File Size Policy

No file should exceed 300 LOC (excluding pure data/JSON files). Large files are split by concern — see the refactor plan for details.
