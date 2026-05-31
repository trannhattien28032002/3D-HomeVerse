Command System Review

Architecture Overview


Architecture Overview

The command system is a discriminated union pattern with 3 core files:

┌───────────────────────────────────┬────────────────────────────────────┐
│               File                │                Role
├───────────────────────────────────┼────────────────────────────────────┤
│ engine/commands/EngineCommands.ts │ Type definitions (8 command types) │
├───────────────────────────────────┼──────────────────────
│ engine/commands/dispatcher.ts     │ Execution logic (switch statement) │
├───────────────────────────────────┼────────────────────────────────────┤
│ engine/commands/history.ts        │ Snapshot-based undo/redo stacks    │
└───────────────────────────────────┴──────────────────────

---
Commands (8 total)

ENSURE_NODE       // Create node at world coords
MOVE_NODE         // Move node + reconnect walls
ADD_WALL          // Connect two nodes with a wall
REMOVE_WALL       // Delete wall + orphaned nodes
MERGE_NODE        // Snap source into target node
SPLIT_WALL        // Cut wall at a point
RESOLVE_INTERSECTIONS  // Auto-split crossing walls
UPDATE_WALL       // Change thickness/height

---
Undo/Redo System

- Snapshot-based: full SceneDocument captured before each t
- 50-entry circular buffer on both undo and redo stacks
- Three transaction variants:
  - transaction(label, fn) — synchronous, most common
  - beginTransaction / commitTransaction — for drag spans
  - cancelTransaction — discards without pushing

---
Issues Found

Functionality gaps:
1. No undo/redo buttons in UI — canUndo()/canRedo() exist on the API but no visual controls are wired up
2. Decor/Color modes unimplemented — BottomNavBar has chair.ts has no handlers for them
3. canUndo/canRedo not reactive — exposed on API but no React hook wraps them, so buttons couldn't update without manual polling

Design risks:
4. RESOLVE_INTERSECTIONS recursively dispatches SPLIT_WALL in a loop — no depth/count guard for large intersection sets
5. Mid-drag undo leaves stale tool state — if undo fires wh the scene reverts but the tool's local state (e.g.,startNodeId) stays set
6. Transaction labels unused — stored in history entries but never surfaced to the user

Missing commands:
- No commands for furniture/decor, materials/colors, or roo
- Room detection is fully automatic; no way to override or manually edit rooms

---
What Works Well

- Clean discriminated union — adding a new command is a ones.ts + one case in dispatcher.ts
- Topology enforcement is solid (duplicate wall prevention, self-loop check, orphan cleanup)
- Serialization round-trips through the same dispatcher pipeline — undo/redo follows identical validation as live edits
- Tool context pattern (withTransaction, beginTransaction) cleanly isolates tools from history internals

---
Top Recommendations

1. Add undo/redo toolbar buttons — the backend is fully ready; just need useEngineApi() + canUndo/canRedo state
2. Guard RESOLVE_INTERSECTIONS with a max-iteration count to prevent stack overflow on pathological inputs
3. Flush/cancel open transactions on undo — check if beginTlying an undo snapshot to avoid stale tool state
4. Plan decor commands before building the decor UI — the dispatcher will need PLACE_FURNITURE, MOVE_FURNITURE, REMOVE_FURNITURE at minimum