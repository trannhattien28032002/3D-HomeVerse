Architectural Review — HomeVerse 3D Editor

Based on what I've observed across the codebase so far (engine ECS, dispatcher, snapshot pipeline, 2D Konva view, 3D Three.js renderer, the React shell). Where I'm inferring rather than confirming, I flag it.

---
1. Current Architecture (as observed)

┌──────────────────────────────────────────────────────────────┐
│  React App (EditorPage)                                       │
│  ├── TopNavBar / BottomNavBar  ── nav actions ──┐            │
│  ├── PlanView2D  (Konva, ~800 LOC monolith)      │            │
│  │     └── useFloorPlanStore  ──► reads ECSSnapshot         │
│  └── SceneView3D  ── mounts <canvas> ─► engine.createEngine │
└──────────────────────────────────┬───────────────────────────┘
                                   │ commands ↓     ↑ snapshots
┌──────────────────────────────────▼───────────────────────────┐
│  Engine (window.gameEngine, mutable singleton)                │
│  ├── World (ECS)                                              │
│  │     ├── Components (Transform, WallNodes, WallSize, ...)  │
│  │     └── Systems (run sequentially per frame):              │
│  │         Orbit → Gizmo → Placement → Collision →            │
│  │         Light → WallGeometry → Room
│  ├── Dispatcher (EngineCommand → mutate ECS)                  │
│  └── EngineEvents (snapshot emit, on/off)                     │
└───────────────────────────────────────────────────────────────┘

Data flow contract:
- Commands enter the engine (window.gameEngine.api.dispatch(...)).
- Systems run sequentially each frame; SnapshotSystem is last.
- React subscribes via engine.api.events.on("snapshot", ...) and re-renders.
- Coordinate conversion happens in useFloorPlanStore (world-meters → canvas-px).

---
2. High-Level Architectural Risks

🔴 R1 — The engine is a global singleton

window.gameEngine is the only handle. This locks out:
- Multiple editor instances (split-screen, comparison view, embedded preview)
- Server-side rendering of thumbnails
- Test fixtures (you can't have two engines in a test runner)
- Multi-floor (which is on your roadmap) if you ever want each floor as its own engine

Severity: medium now, high when roadmap items kick in. Migrate to dependency injection via React context (<EngineProvider engine={...}>) before the singleton assumption proliferates further.

🔴 R2 — Rendering is split across two paradigms

You're using imperative Three.js (raw scene manipulation in systems and factories) plus declarative React Konva. The README mentions React Three Fiber but the actual 3D code is imperative.

The risk: every new feature that touches both views (door insertion, furniture placement, gizmos) has to be wired twice — once in a React component, once in a Three.js system. The mental models don't match, so synchronization bugs become inevitable.

Decision needed: pick one paradigm for 3D. R3F would unify the mental model with React state, but you'd lose the ECS clarity for procedural geometry. Staying imperative is fine but commit to it — remove R3F references from your stack description.

🔴 R3 — Snapshot-based sync has a hard ceiling

SnapshotSystem rebuilds ECSSnapshot every frame and emits to React. React's useFloorPlanStore then runs a useMemo that maps over every node, wall, cap, room, dimension, and angleDimension on every change.

At ~50 walls (small house) this is invisible. At ~500 walls (multi-floor apartment block, library asset previewing), this becomes the bottleneck. Once you add furniture instances (target ~1000+ for a populated scene), the snapshot becomes an O(N) string-allocation tax on every frame the engine is dirty.

This won't kill you today. It will kill you when objects/materials/multi-floor land.

---
3. Scalability Concerns

S1 — No spatial indexing for hit testing

snapToNodeOrGrid in PlanView2D.tsx is O(nodes + walls) linear scan, called on every onMouseMove. At 50 walls, fine. At 5000 (warehouse floor, retail, or once instanced object placement targets the same code path), you'll feel it.

Fix later, not now: when wall count exceeds ~1000, introduce a 2D spatial hash or KD-tree. Engine-side NodeRegistry would be the right place.

S2 — WallGeometrySystem rebuilds the world on any node movement

The miter computation has a hash-based cache per node, which helps. But: moving one node still re-evaluates the cache key for every node in nodeWalls, and any WallPolygon whose component was removed (line 100 of dispatcher: world.removeComponent(entity, WallPolygon)) forces a full rebuild of that wall's mesh.

The cache invalidation is correct, but the pattern of "remove polygon component → system regenerates" doesn't tell the system which corners actually changed. A dirty-set approach (nodeRegistry.markDirty(nodeId)) would let WallGeometrySystem recompute only the affected nodes instead of iterating the full graph.

S3 — RoomSystem hash compares entire graph st
if (hash === this.lastHash) return;

String concatenation + comparison is fine at 50 nodes. At 5000 nodes this becomes the most expensive thing in the frame. Replace with a counter incremented in NodeRegistry.move/ensureNode/connectWall/disconnectWall — same correctness, O(1) check.

S4 — Snapshot history will explode for undo/redo

You haven't built undo/redo yet (it's roadmap). When you do, the naive approach (store every ECSSnapshot) will balloon. Plan for command-log inversion (each EngineCommand defines its inverse) rather than snapshot-stack. The current command shape supports this — ADD_WALL → REMOVE_WALL, MOVE_NODE → MOVE_NODE to previous position. But RESOLVE_INTERSECTIONS is implicit and would need to be folded into the user-facing command's transaction boundary.

---
4. Tight Coupling

C1 — PlanView2D.tsx imports directly from src/engine

import type { EngineCommand } from "src/engine/commands/EngineCommands";

The UI layer reaches into the engine's internal 

const ox = vpW / 2, oy = vpH / 2;
return { nodes: snap.nodes.map(n => nodeToPx(n, ox, oy)), ... }

The store re-runs the entire conversion when viewport resizes. Worse, world coordinates get baked into pixel space inside the store, so the canvas-px result is invalidated by every browser resize.

A cleaner split: store holds logical view model in world units, Konva applies pan/zoom/origin as a Stage transform. The current PX_PER_WORLD = 100 is doing the same work as stageScale — they fight each other conceptually.

Cost-benefit: large refactor for a real (but theoretical-today) cleanness gain. Tag it for the next major architecture pass.

C3 — Konva-specific types in useFloorPlanStore

Node2D, Wall2D, Dimension2D etc. are pixel-space, Konva-shaped types. If you ever introduce a third view (split-screen, minimap, paper export), they don't fit. Better to keep the store output in logical units and let each view do its own projection.

C4 — PX_PER_WORLD constant duplicated

Defined in useFloorPlanStore.ts AND PlanView2D.tsx. They must agree, but nothing enforces it. Move to a shared constant.

C5 — Camera and scene setup mixed with rendering

sceneSetup.ts instantiates the scene, camera, renderer, HDRI loader, fog, and grid — all in one function. Each of these has different lifecycles:
- Scene/renderer: tied to canvas
- HDRI: async, can fail, needs reloading on material swap
- Camera: needs preset switching (now), VR/AR adaptation (future digital-twin)
- Grid: visualization-only, should be toggleable

Split into createRenderer, createScene, createCamera, setupEnvironment — each independently testable.

---
5. Rendering Pipeline Risks

P1 — Mesh ownership is scattered

WallGeometrySystem owns wall meshes AND cap meshes. RoomSystem owns floor meshes. WallFactory creates the initial mesh that WallGeometrySystem later replaces. engine.dispose() does a blanket scene.traverse to clean up.

Three different ownership patterns coexist. When you add doors, windows, furniture, lighting fixtures, you'll have a third or fourth pattern. This is where memory leaks come from in long-running editors — a mesh slips out of one system's tracking and never gets disposed.

Pattern to adopt: every mesh registered with a single MeshRegistry keyed by entity ID. On entity destruction, registry disposes geometry + material. Factories only construct; systems only update; the registry only owns lifecycle.

P2 — Materials are inline, not pooled

const material = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.9 });

Each wall gets its own material instance. With 1000 walls of the same color, that's 1000 GPU material binds instead of 1. Once you add a material library (roadmap), pooling becomes mandatory.

Fix: MaterialRegistry that returns shared instances keyed by {color, metalness, roughness, texture} signature.

P3 — Render loop is system-driven, not damage-driven

The ECS loop runs every frame, regardless of whether anything changed. For an editor where users frequently pause to think, this burns battery and GPU. Three.js renderer can skip frames when the scene is clean.

Pattern: introduce a "dirty" flag at the engine level. Systems set dirty when they mutate. Render only when dirty OR camera is animating. Drop FPS to 0 when idle.

P4 — HDRI loader has no error handling

new EXRLoader().setPath("/hdri").load("/studio.exr", (texture) => {...})

No onError callback. If the HDRI fails to load (n
PlanView2D recalculates ss(...) / sh(...) per element per render. At 50 walls with dimensions + angle dimensions + caps + extension lines, that's hundreds of recomputations per frame during zoom. Memoization by stageScale would help. Or move to a single Konva Group with scaleX={1/stageScale} applied at the group level (Konva supports this).

---
6. State Management Risks

M1 — State is in three places

1. Engine ECS — source of truth for geometry
2. React store (useFloorPlanStore) — derived snapshot, but useState for current snap
3. PlanView2D local state — drawState, selectedWallIds, stageScale, stagePos, refs

Selection lives in the React component but is meaningful to both views (when you click a wall in 3D, the 2D view should highlight it). Currently selection is 2D-only.

Fix: lift selection to the engine as an EntitySelecti
This worked at the current scale. It won't work when you add: multi-select drag, lasso select, vertex edit mode, snap preview overlays, measurement tool, alignment guides. Each of these wants its own "interaction mode" with its own state machine.

Pattern to adopt: Tool abstraction. Each tool (SelectTool, DrawWallTool, MeasureTool, etc.) has onPointerDown/Move/Up/Cancel, owns its own state, and emits engine commands. PlanView2D becomes a tool host, not a 800-line god component.

M3 — Commands are not transactional

ADD_WALL followed by RESOLVE_INTERSECTIONS is logically one user action but two commands. If undo treats them separately, undo would leave the world in an inconsistent intermediate state.

Pattern: introduce a Transaction wrapper:
dispatch.transaction(() => {
   dispatch({ type: "ADD_WALL", ... });
   dispatch({ type: "RESOLVE_INTERSECTIONS", ... });
}, "Add Wall");

The transaction records all sub-commands, becomes one undo entry, and has a user-facing label.

M4 — Component mutation is direct

wn.startNodeId = command.newNodeId in dispatcher mutates the component in place. This is normal for ECS, but:
- It defeats any structural-sharing optimization for snapshots
- It makes change detection impossible (you can't compare before/after)
- It makes undo painful (no record of previous value)

If you go down the immutable component path, change all dispatcher mutations to world.replaceComponent(entity, new WallNodes(...)). Cost: minor allocation overhead. Benefit: trivial undo, trivial change detection, trivial collaborative diffing.

---
7. 2D ↔ 3D Synchronization Complexity

Sy1 — One-way snapshot, no per-field granularity

Every snapshot rebuilds the full ECSSnapshot even if only one node moved. React's useMemo([snap]) doesn't help — the snap reference changes every frame the engine is dirty.

For 50 walls this is invisible. For a populated scene with furniture + materials + multi-floor, this becomes a critical bottleneck. The pattern doesn't scale to collaborative editing either — diffing snapshots field-by-field is the same cost as just rebuilding everything.

The pattern professional editors use: event-sourced state where each mutation emits a typed change event. Views subscribe to events that affect them. Snapshot becomes a hydration vehicle, not the sync mechanism.

Sy2 — No version vector / sequence number on snapshots

When you add collaboration, you need to detect "this snapshot is older than what I have locally." Currently there's no version on ECSSnapshot. Add version: number and bump on every mutation. Cheap insurance.

Sy3 — Coordinate flip is implicit

useFloorPlanStore documents "World Z → canvas Y with same sign (no flip)." This is correct, but the assumption is buried in conversion functions. When you add export-to-DXF, export-to-PDF, AR view, the convention needs to be explicit and centralized — a CoordinateSpace abstraction with documented worldToCanvas, worldToScreen, worldToARWorld etc.

Sy4 — vpW / vpH are part of the conversion

The store takes viewport dimensions and uses them to center coordinates. This means the same node has different Konva coordinates depending on viewport size, even if pan/zoom hasn't changed. Resize during interaction can produce visible jumps. The right place for "what's centered on screen" is the Stage transform (stagePos.x/y), not the data conversion.

---
8. Future Technical Debt Risks (Roadmap-Specific)

Roadmap Item: Object library
Current Blocker: WallFactory pattern doesn't generalize; no prefab/template system
Severity: High
────────────────────────────────────────
Roadmap Item: Material library
Current Blocker: Materials inline in factories; no MaterialRegistry; no texture cache
Severity: High
────────────────────────────────────────
Roadmap Item: Undo/redo
Current Blocker: Commands mutate directly, no inverse defined, no transaction boundary
Severity: Critical — must fix before more features
────────────────────────────────────────
Roadmap Item: Multi-floor
Current Blocker: No floorId on nodes/walls; RoomDetection assumes single graph; camera presets assume single-storey scale
Severity: High
────────────────────────────────────────
Roadmap Item: Collaborative editing
Current Blocker: Singleton engine, no version vectors, no CRDT layer, mutable components
Severity: Critical for the feature
────────────────────────────────────────
Roadmap Item: Digital twin
Current Blocker: No data ingestion layer; no async source binding; no entity → external-id mapping
Severity: Medium (long-term)
────────────────────────────────────────
Roadmap Item: Robotics simulation
Current Blocker: Cannon collision is rudimentary; no navigation mesh; no time-step abstraction
Severity: High when feature lands
────────────────────────────────────────
Roadmap Item: Persistence / file format
Current Blocker: No serialization layer; default scene is code, not data
Severity: Critical before any save/load

10. R3F decision — pick one paradigm for 3D. Either commit to imperative ECS-driven Three.js (and remove R3F from docs/dependencies) or migrate the imperative scene graph to R3F.

---
What I'm not raising (intentionally)

- Code style, naming, indentation — out of scope per your request
- Specific bug fixes — those are evolutionary, not architectural
- The ss/sh zoom-compensation work we just did — that's view-level polish, structurally fine
- The current 2D/3D coordinate convention — it's consistent, just buried

---
Closing observation

The architecture is structurally sound for the current scope — ECS is a good fit for procedural floor plan geometry, the command pattern gives you a clean engine boundary, and snapshot-based sync is the right starting point.

The risk is not what you have today. The risk is that every roadmap item you've named will stress a specific seam that hasn't been reinforced yet. Transactions, mesh ownership, selection scope, floor scope, and contract boundaries are the load-bearing walls that need to exist before the second floor goes on.

Build those next. Build them deliberately. Don't let them emerge as side-effects of feature work.