# 3D HomeVerse

A browser-based 3D interior design tool with a dual-mode editor: a full 3D viewport and a 2D floor plan editor. Draw walls as a graph of connected nodes, which are extruded in real-time into 3D geometry with miter-joined corners.

<!-- GSD:generated -->

## Features

- **Dual-mode editor** — toggle between 3D orbit view and 2D floor plan drawing (`Tab`)
- **Node-graph wall system** — walls are edges between nodes; miter joints computed automatically
- **Wall openings** — doors/windows cut through walls in real-time via CSG (`three-bvh-csg`)
- **Furniture catalog** — browse and place decor items (bed, bathroom, doors, shelves…)
- **Floor & wall-mounted placement** — drop items on the floor or mount them on walls
- **Gizmo manipulation** — translate (`Q`) and rotate (`W`) selected objects in 3D
- **ECS engine** — framework-free TypeScript Entity-Component-System decoupled from React
- **Room detection** — closed wall polygons are detected and filled as room geometry
- **Dimension annotations** — real-time length and angle labels on the 2D canvas
- **Draw / select tools** — draw mode for placing walls, select mode for moving nodes
- **Physics** — cannon-es collision detection with drag-ghost preview
- **Save / load** — export and import scenes as `.homeverseplan` files (`Ctrl+S` / `Ctrl+O`)
- **HDRI lighting** — studio EXR environment map for realistic 3D shading

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| 3D rendering | Three.js 0.183 (OrbitControls, TransformControls, EXRLoader) + `three-bvh-csg` |
| 2D editor canvas | React Konva 19 |
| Physics | cannon-es |
| State | Zustand 5 |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
```

### All scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Project Structure

```
src/
├── engine/          # Framework-free TypeScript ECS engine
│   ├── ecs/         # World, Entity, Component, System, Query
│   ├── components/  # Data-only ECS components (Transform, WallNodes, …)
│   ├── systems/     # Per-frame systems (WallGeometry, Dimension, Snapshot, …)
│   ├── commands/    # EngineCommands discriminated union + dispatcher
│   ├── events/      # EngineEvents pub/sub bus + ECSSnapshot type
│   ├── game/        # Entity factories (WallFactory, LightFactory, …)
│   ├── graph/       # NodeRegistry, RoomDetection
│   ├── setup/       # createEngine, sceneSetup, systemSetup, defaultScene
│   └── utils/       # Pure geometry helpers
└── app/             # React UI layer
    ├── pages/       # HomePage, ProjectsPage, EditorPage, LoginPage
    ├── components/  # Editor chrome: SceneView3D, PlanView2D, DecorCatalog, tools, …
    ├── hooks/       # useEditorShortcuts, useEngineApi, usePlanShortcuts, …
    ├── store/       # useUIStore (zustand), useFloorPlanSnapshot (snapshot subscriber)
    ├── routes/      # BrowserRouter + route definitions
    └── constants/   # designTokens, navigation schema
```

## Architecture

The codebase is split into two strict layers:

- **`src/engine/`** — pure TypeScript, imports only `three` and `cannon-es`. Never imports from `src/app/`.
- **`src/app/`** — React components and Zustand stores. Communicates with the engine via:
  - **Commands** — `engine.api.dispatch({ type: 'CMD', ... })` (engine from `useEngineOrNull()`)
  - **Snapshot events** — `engine.api.events.on('snapshot', handler)`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | HomePage | Landing page |
| `/project/:id` | EditorPage | Main 3D + 2D editor |
| `/projects` | ProjectsPage | Project list |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Toggle 2D ↔ 3D |
| `V` | Select tool |
| `B` | Switch to 2D + Draw Wall tool |
| `F` | Open/close Decor Catalog |
| `Q` | Gizmo translate (3D, when not placing) |
| `W` | Gizmo rotate (3D, when not placing) |
| `Esc` | Cancel furniture placement |
| `Ctrl+S` | Save scene (`.homeverseplan`) |
| `Ctrl+O` | Open scene |

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/FEATURE-FLOWS.md](docs/FEATURE-FLOWS.md) | Per-feature execution flows + design rationale (dev onboarding) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, ECS patterns, React↔Engine bridge |
| [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) | First-run walkthrough |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | How to add components, systems, commands |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy and setup |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Vite, TypeScript, ESLint, and engine config |
