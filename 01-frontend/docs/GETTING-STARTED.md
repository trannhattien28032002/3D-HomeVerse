# Getting Started

<!-- GSD:generated -->

This guide walks you through running 3D HomeVerse for the first time and gives you a quick tour of the editor.

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | LTS (18+) |
| npm | Bundled with Node |

No global CLI tools are required beyond Node and npm.

## Install and Run

```bash
# 1. Clone the repository
git clone <repo-url>
cd "3D Interior Design v1.0/3D-HomeVerse/01-frontend"

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

The first load triggers a loading screen while Three.js initialises the WebGL context and the ECS engine boots up. This typically takes 1–3 seconds. The loading bar advances automatically; once it reaches 100% the editor appears.

## Application Routes

| URL | Page | Description |
|-----|------|-------------|
| `/` | Home | Landing / project picker |
| `/projects` | Projects | Project list |
| `/project/:id` | Editor | 3D + 2D editor (main workspace) |

Navigate to `/project/new` (or click an existing project) to open the editor.

## Editor Overview

The editor has two view modes that you switch between freely:

### 3D Mode (default)

The Three.js viewport with orbit camera controls.

| Control | Action |
|---------|--------|
| Left-drag | Orbit camera |
| Right-drag / middle-drag | Pan |
| Scroll wheel | Zoom |

Bottom navbar actions available in 3D mode:

| Button | Action |
|--------|--------|
| Decor | Add furniture / decor objects |
| Color | Apply materials |
| Rotate Left / Right | Rotate orbit by 45° |
| Top | Switch to plan (top-down) camera preset |
| 3D View | Switch to perspective camera preset |
| Walk | Switch to eye-level camera preset |
| **2D** | Switch to 2D floor plan editor |

### 2D Mode (floor plan editor)

A React Konva canvas for drawing and editing the wall graph.

| Control | Action |
|---------|--------|
| Draw tool (Build) | Click to place nodes; each click extends the current wall |
| Select tool | Click or drag nodes to move them |
| Pan | Drag on empty canvas |
| Scroll wheel | Zoom in/out |

Bottom navbar actions available in 2D mode:

| Button | Action |
|--------|--------|
| Select | Switch to select/move tool |
| Build | Switch to wall draw tool |
| Decor | Add decor objects |
| Color | Apply materials |
| **3D** | Switch back to 3D viewport |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `B` | Build (draw) tool |
| `F` | Decor tool |
| `M` | Material tool |
| `R` | Rotate |
| `Tab` | Toggle 2D / 3D |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save scene (downloads `scene.homeverseplan`) |
| `Ctrl+O` | Open scene (file picker — accepts `.homeverseplan` and `.json`) |

## Drawing Your First Room

1. Press `Tab` or click the **2D** button to switch to the floor plan editor.
2. Press `B` or click **Build** in the bottom navbar to activate draw mode.
3. Click on the canvas to place the first wall node.
4. Click again to place a second node — a wall segment appears between them.
5. Continue clicking to extend the wall chain.
6. Click an existing node to close a loop — the room will be detected automatically and filled.
7. Press `V` or click **Select** to switch to move mode and drag nodes to adjust the shape.
8. Press `Tab` to switch back to 3D and see the result.

## Saving and Loading

- **Ctrl+S** downloads the current scene as `scene.homeverseplan` (a JSON file).
- **Ctrl+O** opens a file picker. Select any `.homeverseplan` or `.json` file to restore a scene.

If the engine has not finished initialising when you press Ctrl+O, an alert will remind you to wait.

## Troubleshooting

**Port already in use**

```bash
# Run on a different port
npm run dev -- --port 5174
```

**3D scene is dark / black**

The HDRI environment map (`public/hdri/studio.exr`) must be present. If the file is missing, copy it back from source control. The file is committed to the repo and should not need to be downloaded separately.

**"Engine not ready" alert on load**

The ECS engine and Three.js renderer initialise asynchronously. Wait for the loading screen to complete before trying to open a file.

**Node version mismatch**

Run `node -v` and confirm it is 18 or later. Use `nvm` or `fnm` to switch if needed.

## Next Steps

- [docs/DEVELOPMENT.md](DEVELOPMENT.md) — how to add features, commands, ECS systems
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — system design and the React↔Engine bridge
- [docs/CONFIGURATION.md](CONFIGURATION.md) — Vite, TypeScript, and engine configuration
