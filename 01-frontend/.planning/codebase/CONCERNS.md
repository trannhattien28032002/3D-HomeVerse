# Codebase Concerns

**Analysis Date:** 2026-05-13

---

## In-Flight Refactor (High Priority)

**Branch feature/tntien/draw2d_v1 - large uncommitted change set:**
- Files: entire src/ tree, 50+ modified files, multiple deletions
- Deleted: src/app/components/sidebar/ (AddButton, CategoryFilter, ObjectCard, ObjectList, Sidebar, SidebarHeader), src/app/components/Canvas.tsx, src/app/components/FloatingButton.tsx, src/engine/systems/CameraSystem.ts
- Replaced by: new editor layout in src/app/components/editor/ and src/app/pages/Plan2DPage.tsx
- Risk: Deleted CameraSystem.ts may have had functionality not fully reproduced in OrbitControlSystem.ts. Sidebar object-placement workflow is gone with no replacement -- users cannot place furniture or objects in 3D.
- Safe merge path: Audit CameraSystem.ts git diff before merging; confirm object-placement story is addressed or deferred.

---

## Tech Debt

**window.gameEngine global singleton:**
- Files: src/engine/engine.ts:98, src/app/components/editor/PlanView2D.tsx:49-53, src/app/store/useFloorPlanStore.ts:166-173
- Issue: Engine instance stored on window.gameEngine and accessed directly by React. No dependency injection or React context.
- Impact: SSR impossible, unit testing impossible without full DOM+Three.js, invisible module coupling.
- Fix approach: React context (EngineContext) providing the EngineApi ref, populated in src/app/components/editor/Canvas.tsx after createEngine().

**engineBridge.ts is entirely commented-out dead code:**
- File: src/app/engine/engineBridge.ts:1-26
- Issue: Entire file is commented out. Was the intended abstraction layer to decouple React from window.gameEngine, never activated.
- Fix approach: Delete the file or implement it to replace the global.

**INITIAL_NEXT_WALL_ID duplicated as a magic number:**
- Files: src/app/store/useUIStore.ts:7 (hard-coded = 4), src/engine/setup/defaultScene.ts (source of truth)
- Issue: useUIStore has a local copy requiring it to equal DEFAULT_WALLS + 1. Default scene init is commented out in src/engine/engine.ts:37, so values silently diverge if re-enabled.
- Fix approach: Import the constant from defaultScene.ts rather than duplicating it.

**Fake loading-progress bar with a leaked timeout:**
- File: src/app/pages/EditorPage.tsx:22-30, 67-68
- Issue: Random-increment setInterval stops at 80%, jumps to 100% on onReady. The setTimeout at line 68 (350 ms) has no cleanup ref -- sets state on an unmounted component if navigation occurs during that window.
- Fix approach: Store the timeout id in a ref and cancel in cleanup, or use an indeterminate spinner.

**void startNodeId unused-variable suppression hack:**
- File: src/engine/commands/dispatcher.ts:269
- Issue: startNodeId destructured from wn but never used. Suppressed via void startNodeId instead of removing it from the destructuring.

---

## Known Bugs

**Node/wall ID race on rapid clicks in draw mode:**
- File: src/app/components/editor/PlanView2D.tsx:196-197
- Issue: nextNodeId() and nextWallId() read window.gameEngine?.nodes.nextAvailableNodeId() inline at click time. Two rapid clicks before the ECS snapshot round-trips return the same ID, producing duplicate nodes/walls.
- Trigger: Rapid clicking or touch events in draw mode.
- Workaround: None currently.

**Wall drag RESOLVE_INTERSECTIONS uses stale wall ID after a snap-split:**
- File: src/app/components/editor/PlanView2D.tsx:580
- Issue: After dragging, dispatches RESOLVE_INTERSECTIONS with closure-captured wall.id. If the drag split the wall, the original ID no longer represents the full moved segment, so intersection resolution is partial.
- Impact: Overlapping walls can remain after a drag-snap operation.

**useFloorPlanStore subscription targets stale engine on re-init:**
- File: src/app/store/useFloorPlanStore.ts:169-174
- Issue: useEffect with empty deps reads window.gameEngine at mount only. Under React Strict Mode double-mount or engine re-init, subscription targets the old instance.
- Impact: 2D view shows no updates after engine re-init.

---

## Type Safety Issues

**as unknown casts in EventBus bypass generic type safety:**
- File: src/engine/events/EngineEvents.ts:117, :119, :126
- Issue: Handlers stored as Set<unknown> and cast via handler as unknown on add/delete. lastSnapshot assigned via as unknown as ECSSnapshot. Defeats generic type-checking at the only event-bus layer.
- Fix approach: Per-key typed handler map to avoid the casts.

**previewLineRef typed as any:**
- File: src/app/components/editor/PlanView2D.tsx:209
- Issue: useRef<any>(null) for the Konva Line ref -- loses autocomplete and type-checking on the .points() call at line 386.
- Fix approach: useRef<Konva.Line | null>(null).

**Non-null assertion on potentially absent node in SPLIT_WALL:**
- File: src/engine/commands/dispatcher.ts:241
- Issue: nodeRegistry.get(endNodeId)! used after disconnectWall has already been called. If endNodeId is absent, throws at runtime with no diagnostic.
- Fix approach: Guard with if (!endNode) break before using the value.

---

## Performance Concerns

**WallGeometrySystem builds string hashes from scratch every frame:**
- File: src/engine/systems/WallGeometrySystem.ts:238-241
- Issue: Every frame builds hash strings via toFixed() concatenation over all node-wall pairs even when nothing changed. The nodeCache check avoids geometry rebuilds but not the hash construction itself.
- Fix approach: Dirty flag per node set by dispatcher on MOVE_NODE/ADD_WALL/REMOVE_WALL. Skip hash computation for clean nodes.

**RoomSystem hashes full topology every frame:**
- File: src/engine/systems/RoomSystem.ts:33-35
- Issue: Every frame calls Array.from(node.connectedWallIds).join() for every node -- Set-to-array conversion and string join every frame.
- Fix approach: Same dirty-flag approach as WallGeometrySystem.

**SnapshotSystem builds multi-kilobyte hash strings every frame:**
- File: src/engine/systems/SnapshotSystem.ts:57-76
- Issue: Constructs wallHash, nodeHash, capHash strings (several KB on large plans) via toFixed() mapping before comparing with lastHash. Pure allocation waste when nothing changed.
- Fix approach: Integer dirty-counter incremented by the dispatcher instead of string hashing.

**RenderSystem sets position/rotation on every mesh every frame unconditionally:**
- File: src/engine/systems/RenderSystem.ts:28-43
- Issue: Calls mesh.position.set() and mesh.rotation.y for all Transform+Mesh entities every frame, including static objects that never move.
- Fix approach: dirty flag on Transform; sync mesh only when dirty, then clear.

**PlanView2D is an ~800-line component with no memoization:**
- File: src/app/components/editor/PlanView2D.tsx
- Issue: Not wrapped in React.memo. useFloorPlanStore returns new array references on every snapshot, triggering a full re-render of all Konva layers on every engine tick. No layer-level dirty tracking.
- Fix approach: Split into memoized sub-components per Konva layer; use imperative layer.batchDraw() for the preview line instead of React state.

**Two physics engines bundled, only one used:**
- File: package.json:13-14
- Issue: Both @dimforge/rapier3d-compat (~1.8 MB WASM) and cannon-es (~200 KB) are runtime dependencies. Only cannon-es is imported in src/. Rapier is not imported anywhere in src/.
- Fix approach: Remove @dimforge/rapier3d-compat from dependencies to cut ~1.8 MB from the production bundle.

---

## Fragile Areas

**ECS system execution order is implicit and load-bearing:**
- File: src/engine/setup/systemSetup.ts:34-52
- Issue: WallGeometrySystem must run before RenderSystem; DimensionSystem must run before SnapshotSystem. No enforcement -- reordering world.addSystem() calls silently breaks geometry or annotations.
- Required order: OrbitControl -> Gizmo -> PlacementAssist -> Collision -> Light -> WallGeometry -> Room -> Dimension -> Render -> Snapshot
- Fix approach: priority: number field on System sorted at registration, or a documented assertion comment block in systemSetup.ts.

**GizmoSystem.world uses a definite-assignment assertion:**
- File: src/engine/systems/GizmoSystem.ts:25 -- private world!: World
- Issue: TypeScript does not enforce assignment before update() is called. An initialization-order change throws at runtime with no diagnostic.

**RoomSystem.floorMat is a shared material with no dispose() method:**
- File: src/engine/systems/RoomSystem.ts:18-23
- Issue: floorMat created in constructor and shared across all room floor meshes. RoomSystem has no dispose(). The engine scene-traverse dispose in src/engine/engine.ts:85-91 may dispose it via one mesh ref, then a second mesh referencing the same material throws a Three.js material-already-disposed warning.
- Fix approach: Add dispose() to RoomSystem that calls this.floorMat.dispose() and removes all room meshes.

**useFloorPlanStore is a plain React hook misnamed as a Zustand store:**
- File: src/app/store/useFloorPlanStore.ts
- Issue: Uses useState + useEffect + useMemo, not Zustand. Cannot be consumed outside React components. Misleading placement alongside actual Zustand stores useUIStore, useEditorStore, useWallStore.

**nextNodeId() and nextWallId() are plain functions redefined on every render:**
- File: src/app/components/editor/PlanView2D.tsx:196-197
- Issue: Plain function declarations inside component body, not useCallback. Recreated on every render, preventing memoization of consumers.

---

## Missing Test Infrastructure

**Zero application tests exist:**
- No *.test.ts, *.test.tsx, *.spec.ts, or *.spec.tsx files exist in src/.
- No test runner configured: package.json has no vitest, jest, or similar dependency; no vitest.config.* or jest.config.* file present.
- Impact: The entire ECS engine, DCEL room-detection (src/engine/graph/RoomDetection.ts), wall miter geometry (src/engine/systems/WallGeometrySystem.ts), and all dispatcher commands are completely untested. The room-detection algorithm already documents 3 edge-case fixes inline -- prime regression targets.
- Priority: High -- especially RoomDetection.findRooms, computeMiters/computePair in WallGeometrySystem, and dispatcher commands SPLIT_WALL, MERGE_NODE, RESOLVE_INTERSECTIONS.

---

## Missing Error Boundaries

**No React error boundaries anywhere in the application:**
- Files: src/main.tsx, src/App.tsx, src/app/pages/EditorPage.tsx
- Issue: A runtime throw inside PlanView2D, WallPropertiesPanel, or any Konva child unmounts the entire app to a blank screen with no user-facing message.
- Fix approach: Add an error boundary wrapping EditorPage at minimum, and a separate one around the Konva Stage.

---

## Security Considerations

**No secrets or hardcoded credentials detected.**
- No API keys, tokens, passwords, or hardcoded external URLs found in src/. No .env file contents were read.

---

## Scaling Limits

**RESOLVE_INTERSECTIONS is O(n) per new wall placed:**
- File: src/engine/commands/dispatcher.ts:305 -- iterates all entries in wallEntityByWallId
- Current capacity: Imperceptible below 100 walls. Noticeable pause likely above ~500 walls.
- Scaling path: Spatial index (R-tree or grid cells) on wall AABB to reduce candidates before the line-segment intersection test.

**RoomDetection.findRooms rebuilds the full DCEL every topology change:**
- File: src/engine/graph/RoomDetection.ts:39-161
- Issue: Rebuilds all half-edges, sorts radially, traverses all faces on every call. Will visibly stall the render frame above ~200 walls.
- Scaling path: Incremental DCEL updates -- only rebuild faces affected by the changed wall.

---

## Dependencies at Risk

**cannon-es is effectively unmaintained:**
- File: package.json:14 -- cannon-es ^0.20.0
- Risk: Community fork of abandoned cannon.js; no active maintainer, last substantive release 2022. Physics bugs will not be patched upstream.
- Migration plan: Replace with @dimforge/rapier3d-compat (already installed) or remove physics if wall collision only requires AABB detection (computable geometrically).

**lucide-react at ^1.8.0 -- recent major version with breaking changes:**
- File: package.json:17
- Risk: v1.x has breaking icon-API changes vs v0.x. Verify icon names in src/app/components/editor/BottomNavBar.tsx and src/app/components/editor/BuildPanel.tsx match v1 naming.

---

*Concerns audit: 2026-05-13*