# Getting Started

## Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8

## Install

```bash
cd 01-frontend
pnpm install
```

## Dev server

```bash
pnpm dev
```

Opens at `http://localhost:5173`.

## Build

```bash
pnpm build
```

Output in `dist/`.

## Project entry points

| File | Role |
|---|---|
| `src/main.tsx` | React root mount |
| `src/app/pages/EditorPage.tsx` | Main editor page |
| `src/engine/engine.ts` | Engine public API |
| `src/engine/setup/systemSetup.ts` | ECS system wiring |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
