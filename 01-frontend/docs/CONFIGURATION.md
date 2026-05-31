# Configuration

## Vite (`vite.config.ts`)

| Key | Value | Purpose |
|---|---|---|
| `resolve.alias['src']` | `./src` | Absolute imports — use `src/...` everywhere |
| `build.target` | `esnext` | Enables top-level await for async handlers |

## TypeScript (`tsconfig.json`)

| Option | Value |
|---|---|
| `strict` | `true` |
| `moduleResolution` | `bundler` |
| `paths['src/*']` | `['./src/*']` — mirrors Vite alias |

## ESLint

Config at `.eslintrc.cjs`. Key rules:

- `@typescript-eslint/no-explicit-any` — error
- `react-hooks/exhaustive-deps` — warning
- `no-console` — warning (use structured logging in production paths)

## Environment variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API root (optional, for cloud save) |

Set via `.env.local` (not committed).

## Constants

Shared constants live in `src/shared/constants/`:

| File | Contents |
|---|---|
| `placement.ts` | `SNAP_M` (0.25), `ROT_STEP_DEG` (15), `GHOST_OPACITY` (0.45) |
| `grid.ts` | `GRID_SIZE` (10), `METER_PX` (60) |
| `ui.ts` | Z-index layers, cursor names, color palette tokens |
