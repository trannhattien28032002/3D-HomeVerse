# External Integrations

**Analysis Date:** 2026-05-14
**Scope:** `3D-HomeVerse/01-frontend/`

> **Top-level note:** This frontend is **fully client-side**. There is **no backend integration today** — no `fetch()`, `axios`, `XMLHttpRequest`, `WebSocket`, GraphQL, tRPC, REST client, auth SDK, analytics SDK, error-tracker, or feature-flag client present anywhere in `src/`. The companion `02-backend/` directory is empty. The only network traffic is the initial static asset load plus Google Fonts. Most "integrations" listed below are therefore **library integrations** (graphics, physics, state, routing) rather than external services.

## APIs & External Services

**HTTP APIs / REST / GraphQL:**
- None. A repo-wide grep for `fetch(`, `axios`, `XMLHttpRequest`, and `endpoint` returns zero matches in application code (only the string `events.on("snapshot", ...)` in `src/app/store/useFloorPlanStore.ts:173` and `EngineEvents` references — internal pub/sub, not HTTP).

**Third-Party Web Services:**
- **Google Fonts** (`fonts.googleapis.com` + `fonts.gstatic.com`)
  - Preconnect + stylesheet links in `index.html:8-12`.
  - Loads `Cinzel` (400/500/600/700), `Nunito Sans` (variable), `Material Symbols Outlined` (variable, fill axis), `Alegreya` (400/700).
  - Referenced as CSS custom properties in `src/index.css:41-49` (`--font-headline-*`, `--font-body-*`, `--font-label-*`).

## Data Storage

**Databases:**
- None. No SQL, NoSQL, ORM, or DB client present.

**File Storage:**
- Local static assets only, served from `public/`:
  - `public/favicon.svg`
  - `public/icons.svg`
  - `public/hdri/studio.exr` — HDRI environment map (loaded via `EXRLoader` at `src/engine/setup/sceneSetup.ts:40-47`).
  - `public/geometry-demo.html` — standalone demo page.

**Caching:**
- None at the application level. Browser HTTP cache only.

**Client-side persistence:**
- None. `localStorage`, `sessionStorage`, and `IndexedDB` are not used anywhere in `src/`.

## Authentication & Identity

**Auth Provider:**
- None. No login flow, no auth SDK, no token handling.
- `src/app/routes/PrivateRoute.tsx` exists but is not referenced by `src/app/routes/Routes.tsx`. Currently the root route (`/`) maps directly to `EditorPage`; `/projects` is public; the commented-out `<Route path="/projects/:id">` for the editor is disabled.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Rollbar, Bugsnag, Datadog RUM, etc.).

**Analytics:**
- None.

**Logs:**
- `console.warn` / `console.log` only. Examples: `src/app/components/editor/PlanView2D.tsx:50` warns when `dispatch` is called before engine init.

## CI/CD & Deployment

**Hosting:**
- Not configured in-tree. No `vercel.json`, `netlify.toml`, `Dockerfile`, `.github/workflows/`, or other deployment manifests under `01-frontend/`.

**CI Pipeline:**
- None detected.

## Environment Configuration

**Required env vars:**
- None. Verified via grep — no `import.meta.env.*` usage in `src/`.

**Secrets location:**
- N/A. No secrets, tokens, or API keys are used.

## Webhooks & Callbacks

**Incoming / Outgoing:**
- None.

---

## Library Integrations (Frontend-internal)

These are not "external services," but they are third-party libraries the codebase treats as integration surfaces. Each one has a well-defined boundary inside `src/engine/` or `src/app/`.

### Three.js (`three` `^0.183.2`) — 3D rendering

- Primary import: `import * as THREE from "three"`.
- Add-on examples imported from `three/addons/...`:
  - `OrbitControls` — `src/engine/setup/systemSetup.ts:2`, `src/engine/systems/OrbitControlSystem.ts:4`, `src/engine/systems/GizmoSystem.ts:15`
  - `TransformControls` — `src/engine/systems/GizmoSystem.ts:13`
  - `EXRLoader` — `src/engine/setup/sceneSetup.ts:2`
- Lifecycle owners: `createScene` (`src/engine/setup/sceneSetup.ts`) builds the `Scene`, `PerspectiveCamera` (FOV 45°, near 0.1, far 1000, position `(0, 12, 16)`), and `WebGLRenderer` (antialias, `setPixelRatio(window.devicePixelRatio)`, `SRGBColorSpace`, `ACESFilmicToneMapping`, shadow map enabled). PMREM-generated environment map from `studio.exr` is applied to `scene.environment` and `scene.background`.
- The engine canvas is mounted by `src/app/components/editor/Canvas.tsx`, which calls `createEngine(canvasRef.current)` (`src/engine/engine.ts:20`).

### Konva + react-konva (`konva` `^10.2.5`, `react-konva` `^19.2.3`) — 2D plan view

- Sole consumer: `src/app/components/editor/PlanView2D.tsx:2` imports `Arc, Arrow, Group, Layer, Line, Rect, Stage, Circle, Text` from `react-konva`.
- The plan view is fed by `useFloorPlanStore(vpW, vpH)` (`src/app/store/useFloorPlanStore.ts`), which subscribes to engine snapshots and projects world units to pixels (`PX_PER_WORLD = 100`).
- Konva-specific rendering for the angle-dimension feature: `Arc` shapes for interior-angle arcs and `Text` for the `"90°"` labels (consumes `angleDimensions` from snapshot — see `AngleDimensionSnapshot` in `src/engine/events/EngineEvents.ts:57`).

### cannon-es (`cannon-es` `^0.20.0`) — collision detection

- Single consumer: `src/engine/systems/CannonCollisionSystem.ts:1-2` (`CANNON.World`, `CANNON.Body`, `CANNON.Vec3`, `CANNON.Quaternion`, `COLLISION_TYPES`).
- Used as an AABB collision oracle for static walls (`StaticBody`) versus a probe body when moving dynamic entities (`DynamicBody`). Synced from ECS `Transform` + `ColliderAABB` components on every world tick.

### @dimforge/rapier3d-compat (`^0.19.3`) — declared but unused

- Listed in `package.json:13` but zero imports anywhere in `src/`. Should either be wired in or removed (see CONCERNS.md once produced).

### Zustand (`zustand` `^5.0.12`) — global UI state

- Stores live under `src/app/store/`:
  - `useUIStore.ts` — sidebar open/closed, viewport width/height, wall-id counter (`getAndIncrementNextWallId`). Initial state pulls from `window.innerWidth/Height`.
  - `useFloorPlanStore.ts` — **not a Zustand store**; it is a custom React hook that subscribes to engine snapshots and projects them to 2D pixel space.
  - `useEditorStore.ts` — entirely commented out (legacy stub).
  - `useWallStore.ts` — deprecated re-export shim that forwards to `useFloorPlanStore`.

### React Router DOM (`react-router-dom` `^7.14.0`) — routing

- Only used in `src/app/routes/Routes.tsx`:
  - `/` → `EditorPage`
  - `/projects` → `ProjectsPage`
  - Commented-out routes for `HomePage` and parameterized `/projects/:id` editor.

### Tailwind CSS v4 (`tailwindcss` `^4.2.2`) — styling

- CSS-first configuration. No `tailwind.config.{js,ts}`.
- Entry: `@import "tailwindcss";` in `src/index.css:1`, followed by an `@theme { ... }` block defining the full Material You palette, typography ramp, and spacing scale (`src/index.css:3-75`).
- Plugin registered in `vite.config.ts:8` via `tailwindcss()` from `@tailwindcss/vite`.

### lucide-react (`lucide-react` `^1.8.0`) — icons

- Used in `src/app/constants/navigation.ts` (camera-view nav buttons that call `window.gameEngine?.api.rotateView(...)` / `setView(...)`).

---

## Engine ↔ UI Bridge (Internal "Integration")

Although not an external integration, the React UI and the ECS engine are intentionally decoupled and worth documenting as an internal contract:

- **Global handle:** `window.gameEngine: EngineInstance` (`src/engine/engineTypes.ts:27-29`). Set by `createEngine` (`src/engine/engine.ts:98`) and cleared in `dispose()`.
- **Outbound (UI → Engine):** `window.gameEngine.api.dispatch(cmd: EngineCommand)` — typed commands declared in `src/engine/commands/EngineCommands.ts`, applied by `src/engine/commands/dispatcher.ts`. Examples: `ADD_WALL`, `setView`, `rotateView` (`src/app/constants/navigation.ts:18-26`, `src/app/components/editor/PlanView2D.tsx:48-54`).
- **Inbound (Engine → UI):** `EngineEvents` pub/sub (`src/engine/events/EngineEvents.ts`). The `SnapshotSystem` (`src/engine/systems/SnapshotSystem.ts`) emits `"snapshot"` events carrying `ECSSnapshot` (`nodes`, `walls`, `caps`, `rooms`, `dimensions`, `angleDimensions`). React subscribes via `useFloorPlanStore.ts:169-174`.
- **Camera presets:** `setView("plan" | "perspective" | "eye-level")` and `rotateView(angleDeg)` (`src/engine/engineTypes.ts:7,14-15`).
- **Dimension pipeline:** `DimensionSystem` → `SnapshotSystem` → `EngineEvents` → `useFloorPlanStore` → Konva primitives in `PlanView2D.tsx` (matches the documented "Angle Dimensions" feature).

---

*Integration audit: 2026-05-14*
