<p align="right">
  <b>English</b> | <a href="README.vi.md">Tiếng Việt</a>
</p>

# 🏠 Tiny Home — 3D HomeVerse

> **A browser-based 3D interior & architecture design tool** — draw a 2D floor plan, watch it extrude into a real-time 3D house, place furniture, paint materials, walk through it in VR, and let an AI design it for you.

🎬 **Watch the demo:** [Demo video on Google Drive](https://drive.google.com/file/d/1G5QG_qnkotrqUL1YuJktAYZpEc1KNJZn/view?usp=sharing)

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-thumbnail.png" alt="Tiny Home landing page" width="800"/>
</p>

---

## 1. Overview

**Tiny Home (3D HomeVerse)** is a web app that lets anyone **design a house or office layout** without installing heavyweight CAD software. Users draw walls on a 2D floor plan as a graph of connected nodes; the engine **extrudes them into 3D wall geometry in real time**, with correctly mitered corners at every joint. From there you can drag-and-drop furniture, paint materials, preview the result in full 3D, or even **put on a VR headset and walk through the house you just designed**.

The project is built with a **React + Three.js frontend fully decoupled from a Node.js + Supabase/Postgres backend**, supporting cloud saves, versioning, per-account project management, and an **AI Agent (Tiny Home Architect)** that can generate an entire house from a single natural-language prompt.

## 2. Key Features

### ✏️ 2D Floor Plan Drawing — Node-graph wall system
Walls are edges between nodes; drag a node to reshape the house, with wall length and corner angles computed and displayed live, plus real-time door/window cut-outs.

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-editor-2D.png" alt="2D floor plan editor" width="800"/>
</p>

### 🧱 Real-Time 3D House Building
The 2D floor plan is extruded into 3D instantly, with move/rotate gizmos, wall & floor material swapping, furniture placement from a catalog, and multiple view angles (Top/Left/Right/Walk).

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-editor-3D.png" alt="3D editor" width="800"/>
</p>

### 🤖 AI Agent House Generation
Just describe what you want (e.g. *"Build me a 50 m² house with 1 bedroom, 1 living room, and 1 bathroom in a Scandinavian style"*) and the AI will lay out the walls, pick materials, and furnish the space to match the requested style.

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-AI-chatbot.png" alt="AI chatbot auto-building a house" width="800"/>
</p>

### 🕶️ VR Walkthrough (WebXR)
Put on a Quest headset and **walk directly through the house you just designed** — teleport, snap-turn, smooth locomotion, controller models, and real-time shadows.

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-VR.png" alt="VR walkthrough" width="800"/>
</p>

### 🏢 Sample Scenes

<p align="center">
  <img src="01-frontend/public/images/Tiny-home-scene-demo.png" alt="Demo scene 1" width="49%"/>
  <img src="01-frontend/public/images/Tiny-home-scene-demo-2.png" alt="Demo scene 2" width="49%"/>
</p>

### Other Features
- **Gizmo manipulation** — translate (`Q`) / rotate (`W`) selected objects
- **Multiselect** — select multiple objects, group-drag, group-rotate, copy/paste, marquee box-select
- **Room detection** — closed wall polygons are auto-detected and filled as floor/ceiling geometry
- **Collision physics** — cannon-es, with drag-ghost preview
- **Save/load scenes** — export/import `.homeverseplan`, plus cloud save + versioning via the backend
- **Project & account management** — sign in (including Google OAuth), project list, rename/duplicate/delete
- **HDRI lighting** — studio EXR environment map for realistic shading

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| 3D rendering | Three.js 0.183 (OrbitControls, TransformControls, EXRLoader, WebXR) + `three-bvh-csg` |
| 2D editor canvas | React Konva 19 |
| Physics | cannon-es |
| State management | Zustand 5 |
| Routing | React Router v7 |
| Styling | Tailwind CSS v4 |
| Backend | Node.js, Supabase (Postgres, Auth, Storage) |
| AI | Gemini (AI agent that drives the scene via natural language) |

## 4. Architecture

The frontend codebase is split into two strict layers:

- **`src/engine/`** — a framework-free TypeScript ECS (Entity-Component-System), with no React dependency; it only imports `three` and `cannon-es`.
- **`src/app/`** — the React + Zustand UI layer, which talks to the engine via **Commands** (dispatch) and **Snapshot events** (subscribe).

The backend provides APIs for auth, scene persistence, versioning, project management, and an AI proxy, backed by Supabase Postgres; 3D assets (GLB/thumbnails) are served from a Storage bucket.

> For full technical details, see `01-frontend/README.md`, `01-frontend/docs/ARCHITECTURE.md`, and `BAO-CAO-PHAN-TICH-DU-AN.md`.

---

<p align="center">
  🎬 <b>Watch the full demo here:</b> <a href="https://drive.google.com/file/d/1G5QG_qnkotrqUL1YuJktAYZpEc1KNJZn/view?usp=sharing">Google Drive Demo Video</a>
</p>
