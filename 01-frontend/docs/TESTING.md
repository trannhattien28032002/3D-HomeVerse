# Testing

## Strategy

| Layer | Approach |
|---|---|
| `shared/math/` | Unit tests — pure functions, no mocking needed |
| `engine/commands/handlers/` | Integration tests — real World instance, no mocks |
| `engine/systems/` | Integration tests — inject minimal ECS state |
| React components | Visual tests via screenshot diff (Playwright) |

## Running tests

```bash
pnpm test          # unit + integration
pnpm test:e2e      # Playwright visual regression
```

## Key invariants to test

- Undo/redo round-trip: `dispatch(cmd) → UNDO` restores identical ECS state
- Wall intersection: `RESOLVE_INTERSECTIONS` produces no overlapping wall segments
- Furniture placement: `PLACE_FURNITURE` respects collision — placed entity never overlaps existing static bodies
- Snapshot sync: after any command, `SnapshotSystem.update()` produces a snapshot consistent with ECS state
