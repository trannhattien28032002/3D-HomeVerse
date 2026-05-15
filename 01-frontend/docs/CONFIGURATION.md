# Configuration

<!-- GSD:generated -->

Reference for all configuration files in 3D HomeVerse. Values are taken directly from source files — no inferred defaults.

## Vite (`vite.config.ts`)

```ts
plugins: [react(), tailwindcss()]
resolve.alias: { "src": path.resolve(__dirname, "src") }
```

| Setting | Value |
|---------|-------|
| Plugins | `@vitejs/plugin-react` (Oxc transform), `@tailwindcss/vite` |
| Path alias | `"src"` → `<root>/src/` |
| Build output | `dist/` (default) |
| Dev server | `localhost:5173` (Vite default) |

The `"src"` alias is the only alias configured. All source imports must use `src/...` — no relative `../../` climbing from `src/app/` into `src/engine/`.

## TypeScript (`tsconfig.app.json`)

Applied to all files under `src/`.

```jsonc
{
  "baseUrl": ".",
  "paths": { "src/*": ["src/*"] },
  "target": "ES2023",
  "lib": ["ES2023", "DOM", "DOM.Iterable"],
  "module": "esnext",
  "moduleResolution": "bundler",
  "jsx": "react-jsx",
  "verbatimModuleSyntax": true,
  "moduleDetection": "force",
  "noEmit": true,
  "skipLibCheck": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "erasableSyntaxOnly": true,
  "noFallthroughCasesInSwitch": true
}
```

Key settings:
- **`moduleResolution: "bundler"`** — matches Vite's resolution; `.ts` extensions allowed in imports.
- **`verbatimModuleSyntax: true`** — type-only imports must use `import type`.
- **`noUnusedLocals / noUnusedParameters: true`** — unused symbols are a compiler error, not just a lint warning.
- **`erasableSyntaxOnly: true`** — no `const enum`, no `namespace` (ES-module safe).

`tsconfig.node.json` applies to `vite.config.ts` only and is a separate composite project.

## ESLint (`eslint.config.js`)

Flat config (ESLint v9). Applies to `**/*.{ts,tsx}`.

| Plugin | Ruleset applied |
|--------|----------------|
| `@eslint/js` | `js.configs.recommended` |
| `typescript-eslint` | `tseslint.configs.recommended` |
| `eslint-plugin-react-hooks` | `reactHooks.configs.flat.recommended` |
| `eslint-plugin-react-refresh` | `reactRefresh.configs.vite` |

`dist/` is globally ignored. No custom rules are added beyond the shared configs.

Run: `npm run lint`

## Tailwind CSS v4

Tailwind is loaded via the Vite plugin — no `tailwind.config.js` file is needed.

Entry point: `src/index.css`
```css
@import "tailwindcss";
```

CSS custom properties for design tokens are defined alongside Tailwind utilities in component `className` strings. No separate `tailwind.config.ts` theme extension exists; token values live in `src/app/constants/designTokens.ts`.

## Design Tokens (`src/app/constants/designTokens.ts`)

```ts
export const T = {
    primary:            "#7c5800",
    primaryContainer:   "#f8b400",
    surface:            "rgba(253,249,240,0.82)",
    onSurface:          "#1c1c17",
    onSurfaceVariant:   "#504532",
    outlineVariant:     "rgba(213,196,172,0.5)",
    shadowGold:         "rgba(124,88,0,0.18)",
} as const;
```

Used directly in component `style` props and Tailwind arbitrary values.

## Engine Constants

### `src/engine/setup/defaultScene.ts`

```ts
export const INITIAL_NEXT_NODE_ID = 20;
export const INITIAL_NEXT_WALL_ID = 10;
```

IDs below these values are reserved for the optional default scene; runtime-created nodes/walls always start at or above these values.

### `src/app/store/useFloorPlanStore.ts`

```ts
const PX_PER_WORLD = 100;
```

Conversion factor: 1 world unit = 100 canvas pixels in the 2D floor plan view. Konva Y-axis maps directly to world Z (no axis flip).

### `src/engine/commands/dispatcher.ts`

Default wall dimensions used when `ADD_WALL` creates geometry:

| Property | Value |
|----------|-------|
| `cy` (center height) | `1.6` world units |
| `height` | `3.2` world units |

### Dimension filtering (`src/engine/systems/DimensionSystem.ts`)

Angle annotations are only emitted when the interior angle is in the range `[5°, 175°]`. Reflex angles and near-collinear walls are suppressed.

## HDRI Lighting

The 3D scene loads an EXR environment map at startup:

```
public/hdri/studio.exr
```

Referenced via the absolute URL `/hdri/studio.exr` (Vite serves `public/` as static root). The file is committed to the repo and required at runtime — removing it will leave the 3D scene without environment lighting.

Default light configuration set in `src/engine/engine.ts`:
- Ambient light intensity: `0.5`
- Directional light: position `(10, 18, 10)`, intensity `0.9`

## Serialization Format

Scenes are saved as `.homeverseplan` files (JSON). Keyboard shortcuts:
- **Ctrl+S** — download `scene.homeverseplan`
- **Ctrl+O** — open file picker (accepts `.homeverseplan` and `.json`)

The format is versioned (`SceneDocument` from `src/engine/serialization/`).

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | HMR dev server on port 5173 |
| `build` | `tsc -b && vite build` | Type-check then bundle to `dist/` |
| `preview` | `vite preview` | Serve `dist/` locally |
| `lint` | `eslint .` | Run ESLint across all `.ts`/`.tsx` |
