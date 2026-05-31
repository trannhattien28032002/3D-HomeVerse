# Command Flow

## How a command travels from UI to ECS

```
┌──────────────┐   dispatch(cmd)   ┌────────────────┐
│  React / Tool │ ────────────────► │  dispatcher.ts │
└──────────────┘                   └───────┬────────┘
                                           │ delegate
                     ┌─────────────────────┼──────────────────────┐
                     ▼                     ▼                      ▼
           wallHandlers.ts     furnitureHandlers.ts     sceneHandlers.ts
           (ADD/DELETE/MOVE/   (PLACE/MOVE/ROTATE/      (LOAD/RESET/
            MERGE wall +        DELETE furniture)         SET_PROJECT)
            RESOLVE_INTERSECTIONS)
                     │                     │
                     ▼                     ▼
              World mutation         EntityRegistry
              (addComponent /        .disposeEntity(id)
               removeComponent /     → MeshRegistry
               markDirty)            → ModelRegistry
                                     → CannonCollisionSystem
                     │
                     ▼
              SnapshotSystem.update()
              → useFloorPlanSnapshot() re-render trigger
```

---

## Command types (EngineCommands.ts)

| Group | Commands |
|---|---|
| Wall | `ADD_WALL`, `DELETE_WALL`, `MOVE_NODE`, `MERGE_NODE`, `RESOLVE_INTERSECTIONS` |
| Furniture | `PLACE_FURNITURE`, `MOVE_FURNITURE`, `ROTATE_FURNITURE`, `DELETE_FURNITURE` |
| Selection | `SELECT_ENTITY`, `DESELECT`, `HOVER_ENTITY` |
| Scene | `LOAD_SCENE`, `RESET_SCENE`, `SET_PROJECT` |
| History | `UNDO`, `REDO` |

---

## Undo / Redo

`history.ts` maintains a stack of `Snapshot[]`. Each mutating command:
1. Saves a pre-mutation snapshot → push to undo stack
2. Applies the mutation
3. `UNDO` pops the stack and restores the snapshot

`MERGE_NODE` and `RESOLVE_INTERSECTIONS` produce compound mutations — they push a single snapshot covering all sub-steps so undo reverts the entire operation.

---

## Async commands

`PLACE_FURNITURE` is async: it awaits `GLTFModelLoader.load(url)` before creating the ECS entity. To avoid race conditions, the handler:
1. Dispatches a synchronous `SELECT_ENTITY(null)` to clear pending state
2. Awaits the GLB load
3. Creates entity + components atomically
4. Dispatches `SELECT_ENTITY(newId)` to re-select

The dispatcher does **not** `await` the handler — callers must not depend on placement being complete immediately after dispatch.

---

## Constraint: dispatcher is router only

`dispatcher.ts` must stay under 150 LOC. It contains only the `switch` statement plus a `default: assertNever(cmd)` type guard. Business logic belongs in handler files.
