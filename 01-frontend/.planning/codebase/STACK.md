# Technology Stack

**Analysis Date:** 2026-05-14
**Scope:** `3D-HomeVerse/01-frontend/`

## Languages

**Primary:**
- TypeScript `~6.0.2` — all source files under `src/` (`*.ts`, `*.tsx`)
- TSX (React JSX) — UI components and pages (`src/app/**/*.tsx`)

**Secondary:**
- JavaScript (ESM) — config files only: `eslint.config.js`
- CSS — `src/index.css` (Tailwind v4 `@import` + `@theme` design tokens) and `src/App.css`
- HTML — `index.html` (single root, loads `/src/main.tsx`)
- EXR (binary) — HDRI environment map asset at `public/hdri/studio.exr`

## Runtime

**Environment:**
- Browser only — no server-side rendering. Renders into `<div id="root">` in `index.html` from `src/main.tsx`.
- Uses `window.gameEngine` global (`src/engine/engineTypes.ts:26-30`) as the bridge between React UI and the ECS engine.
- ES2023 target (`tsconfig.app.json:9`, `tsconfig.node.json:4`).
- Module system: ESM (`"type": "module"` in `package.json:5`, `"module": "esnext"` in both tsconfigs).
- WebGL 2 via Three.js `WebGLRenderer` (`src/engine/setup/sceneSetup.ts:28`).
- No Node runtime version pinning — no `.nvmrc`, no `engines` field in `package.json`.

**Package Manager:**
- npm (lockfile v3) — `package-lock.json` present (~128 KB).
- Lockfile committed.

## Frameworks

**Core:**
- React `^19.2.4` (`react`, `react-dom`) — UI layer. Uses `StrictMode` (`src/main.tsx:7`) and the new JSX transform (`"jsx": "react-jsx"` in `tsconfig.app.json:21`).
- React Router DOM `^7.14.0` — routing via `BrowserRouter` in `src/app/routes/Routes.tsx`.
- Three.js `^0.183.2` — 3D rendering, scene graph, camera, lights, materials (`src/engine/setup/sceneSetup.ts`, `src/engine/engine.ts`, all `src/engine/systems/*`).
- Konva `^10.2.5` + react-konva `^19.2.3` — 2D floor-plan canvas (`Stage`, `Layer`, `Arc`, `Arrow`, `Line`, `Rect`, `Circle`, `Text`) used in `src/app/components/editor/PlanView2D.tsx:2`.
- Zustand `^5.0.12` — global UI state (sidebar, viewport, wall-id counter). Used in `src/app/store/useUIStore.ts:1`.
- Custom ECS engine (no external library) — `src/engine/ecs/{Component,Entity,Query,System,World}.ts`.

**Testing:**
- Not detected. No test framework, runner, or test files present in `src/`.

**Build/Dev:**
- Vite `^8.0.4` — dev server + production bundler (`vite.config.ts`).
- `@vitejs/plugin-react` `^6.0.1` — React Fast Refresh + JSX transform.
- `@tailwindcss/vite` `^4.2.2` — Tailwind v4 Vite plugin (registered in `vite.config.ts:8`).
- TypeScript `~6.0.2` — `tsc -b` runs as project-references build before `vite build` (`package.json:8`).

## Key Dependencies

**Critical (UI + Rendering):**
- `react` `^19.2.4` / `react-dom` `^19.2.4` — UI runtime.
- `three` `^0.183.2` — Loaded via `import * as THREE from "three"` and `three/addons/...` for `OrbitControls`, `TransformControls`, `EXRLoader`.
- `konva` `^10.2.5` + `react-konva` `^19.2.3` — 2D plan view renderer.
- `react-router-dom` `^7.14.0` — `BrowserRouter` / `Routes` / `Route`.
- `zustand` `^5.0.12` — `create()` stores for UI state.

**Critical (Physics & Math):**
- `cannon-es` `^0.20.0` — collision detection. Used by `src/engine/systems/CannonCollisionSystem.ts` (only consumer). AABB collision via `CANNON.World`, `CANNON.Body`, `CANNON.Vec3`, `CANNON.Quaternion`.
- `@dimforge/rapier3d-compat` `^0.19.3` — declared dependency but **not imported anywhere in `src/`**. Carried as a future / alternate physics backend; effectively dead weight today.

**Critical (Styling & Icons):**
- `tailwindcss` `^4.2.2` + `@tailwindcss/vite` `^4.2.2` — Tailwind v4 (CSS-first config). Theme tokens defined in `src/index.css:3-75` via the `@theme` directive (Material You palette, font families Cinzel + Nunito Sans + Alegreya, spacing scale).
- `lucide-react` `^1.8.0` — icon set (used in nav/UI components under `src/app/components/editor/`).

**Infrastructure:**
- `@types/node` `^24.12.2` — for `path` module in `vite.config.ts:3`.
- `@types/react` `^19.2.14`, `@types/react-dom` `^19.2.3`, `@types/three` `^0.183.1` — type definitions.

## Configuration

**Environment:**
- No `.env`, `.env.local`, `.env.production`, or `import.meta.env.*` usage detected in `src/`.
- No runtime configuration — all constants are inlined (e.g. `PX_PER_WORLD = 100` in `src/app/store/useFloorPlanStore.ts:5` and `src/app/components/editor/PlanView2D.tsx:14`).
- Single browser global: `window.gameEngine` (typed via `declare global` in `src/engine/engineTypes.ts:26-30`).
- HDRI asset path hard-coded: `"/hdri"` + `"/studio.exr"` in `src/engine/setup/sceneSetup.ts:41-42`.

**Build:**
- `vite.config.ts` — registers `react()` and `tailwindcss()` plugins; defines path alias `"src"` → `path.resolve(__dirname, "src")`.
- `tsconfig.json` — root with project references to `tsconfig.app.json` and `tsconfig.node.json`.
- `tsconfig.app.json` — app code (`include: ["src"]`):
  - `target: "es2023"`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`
  - `module: "esnext"`, `moduleResolution: "bundler"`
  - `jsx: "react-jsx"`, `types: ["vite/client"]`
  - `paths: { "src/*": ["src/*"] }`, `baseUrl: "."`
  - Strict-ish: `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `moduleDetection: "force"`, `allowImportingTsExtensions: true`, `noEmit: true`
  - `ignoreDeprecations: "5.0"` — quiets TS 6.0 deprecation noise on legacy options.
- `tsconfig.node.json` — for `vite.config.ts` (`include: ["vite.config.ts"]`, `types: ["node"]`, no DOM lib).
- `eslint.config.js` (flat config):
  - Extends `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-react-hooks` flat recommended, `eslint-plugin-react-refresh` vite preset.
  - Globally ignores `dist`.
  - Targets `**/*.{ts,tsx}`.
  - `ecmaVersion: 2020`, `globals: globals.browser`.
- No Prettier, no Biome, no Stylelint config files present.

## Platform Requirements

**Development:**
- Node.js capable of running Vite 8 (Node 20.19+ / 22.12+ per Vite 8 baseline) — not enforced via `engines`.
- npm (lockfile v3, requires npm 7+).
- Modern WebGL2-capable browser for the 3D viewport.
- External network access for Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) preconnected in `index.html:8-12`.

**Production:**
- Static deploy target — `npm run build` produces `dist/`. Output is purely client-side; no server runtime required.
- Must serve `public/hdri/studio.exr` (HDRI environment map) at `/hdri/studio.exr`.

## Scripts (`package.json`)

```text
dev      → vite
build    → tsc -b && vite build
lint     → eslint .
preview  → vite preview
```

---

*Stack analysis: 2026-05-14*
