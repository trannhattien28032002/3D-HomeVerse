# 3D HomeVerse

A browser-based 3D interior design tool with a dual-mode editor: a full 3D viewport and a 2D floor plan editor. Draw walls as a graph of connected nodes, which are extruded in real-time into 3D geometry with miter-joined corners.

<!-- GSD:generated -->

## Features

- **Dual-mode editor** — toggle between 3D orbit view and 2D floor plan drawing
- **Node-graph wall system** — walls are edges between nodes; miter joints computed automatically
- **ECS engine** — framework-free TypeScript Entity-Component-System decoupled from React
- **Room detection** — closed wall polygons are detected and filled as room geometry
- **Dimension annotations** — real-time length and angle labels on the 2D canvas
- **Draw / select tools** — draw mode for placing walls, select mode for moving nodes
- **Physics** — cannon-es collision detection
- **HDRI lighting** — studio EXR environment map for realistic 3D shading

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| 3D rendering | Three.js 0.183 (OrbitControls, TransformControls, EXRLoader) |
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
    ├── pages/       # EditorPage, ProjectsPage, Plan2DPage, HomePage
    ├── components/  # Editor chrome: Canvas, PlanView2D, TopNavBar, …
    ├── store/       # useUIStore (zustand), useFloorPlanStore (snapshot subscriber)
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
| `/` | EditorPage | Main 3D + 2D editor |
| `/projects` | ProjectsPage | Project list |

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, ECS patterns, React↔Engine bridge |
| [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) | First-run walkthrough |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | How to add components, systems, commands |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy and setup |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Vite, TypeScript, ESLint, and engine config |
