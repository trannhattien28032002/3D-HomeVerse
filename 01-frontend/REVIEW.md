---
phase: perf-review-planview2d
reviewed: 2026-06-16T00:00:00Z
depth: deep
scope: 2D rendering path (PlanView2D + snapshot data flow)
files_reviewed: 13
files_reviewed_list:
  - src/app/components/editor/views/PlanView2D/index.tsx
  - src/app/components/editor/views/PlanView2D/FurnitureLayer.tsx
  - src/app/components/editor/views/PlanView2D/WallLayer.tsx
  - src/app/components/editor/views/PlanView2D/RoomLayer.tsx
  - src/app/components/editor/views/PlanView2D/DimensionLayer.tsx
  - src/app/components/editor/views/PlanView2D/HandleLayer.tsx
  - src/app/components/editor/views/PlanView2D/OverlayLayer.tsx
  - src/app/components/editor/views/PlanView2D/usePlanCamera.ts
  - src/app/components/editor/views/PlanView2D/usePlanInput.ts
  - src/app/components/editor/views/PlanView2D/useFurnitureDrag.ts
  - src/app/store/useFloorPlanSnapshot.ts
  - src/engine/systems/sync/SnapshotSystem.ts
  - src/app/components/editor/tools/SelectTool.tsx
findings:
  critical: 0
  high: 4
  medium: 5
  low: 3
  total: 12
status: issues_found
---

# PlanView2D — Performance Review (2D rendering path)

**Reviewed:** 2026-06-16
**Depth:** deep (cross-file: snapshot → hook → layers)
**Focus:** Why the 2D plan lags as object count grows, and which causes survive in production.

## Summary

The architecture is, on paper, well-tuned: `SnapshotSystem` reuses array references per-collection (`reuseIfEqual`), `useFloorPlanSnapshot` memoizes each collection separately, and every layer is `React.memo`'d with a documented "freeze topology during drag" strategy (R2). That groundwork is real and good.

**But the central performance regression is camera-driven, not object-driven.** The single most important finding: **pan and zoom recreate `ss`/`sh`/handlers on every mouse-move frame and feed them as props into every memoized layer, defeating ALL the `React.memo` work and forcing a full re-render + re-map of every object/wall/room/dimension on every pan/zoom frame.** With many objects this is exactly the "heavy lag" the user reports, and it is a **genuine production problem**, not dev-only noise.

A secondary structural cost is the **layer count: ~9 Konva `<Layer>` = 9 stacked `<canvas>` elements**, several of which redraw together. Combined with hit-graph maintenance on the interactive furniture layer, this scales poorly with object count.

The good news: the user's worry that "localhost lag = worse in prod" is only *partly* right. StrictMode double-rendering (H4) is dev-only and inflates the perceived cost on localhost. But H1/H2/H3 are architectural and will persist in production. Fixing H1 alone should give the largest single win.

---

## High

### H1: Pan/zoom recreates `ss`/`sh` + input handlers every frame, busting every layer's `React.memo`

**File:** `src/app/components/editor/views/PlanView2D/usePlanCamera.ts:65-67` and `src/app/components/editor/views/PlanView2D/index.tsx:236-241`

**Why it causes lag:** `usePlanCamera` defines `ss` and `sh` as fresh arrow functions on **every render** (no `useCallback`):

```ts
const ss = (px: number) => px / eff;     // NEW function identity each render
const sh = (px: number) => px / stageScale;
```

During a pan, `usePlanInput.onMouseMove` → `movePan` → `setStagePos` fires on every `mousemove` (tens of times/sec). During zoom, `onWheel` → `applyTransform` → `setStageScale`+`setStagePos`. Each state update re-renders `PlanView2D`, which:

1. Recreates `ss`/`sh` (new identity).
2. Passes `ss` into `RoomLayer`, `FurnitureLayer`, `HandleLayer`, `DimensionLayer` (lines 236, 238, 239, 240) — all `React.memo`'d. Because `ss` is a new reference, **the memo comparison fails for every layer**, so they all re-render even though `furniture`/`walls`/`rooms` references are unchanged.
3. `FurnitureLayer` then re-runs `furniture.map(...)` building N `<Group>` + Rect + Text; `WallLayer` re-runs its `walls.map` fills + door-symbol flatMap; `DimensionLayer` re-maps; `RoomLayer` re-maps.

So the carefully-built per-collection memoization (R2) is **completely bypassed during pan/zoom** — the one interaction where you most need 60fps. This is the primary cause of "lag with many objects" and it is **fully present in production**.

Also note `inputHandlers` is rebuilt every render: `usePlanInput` returns a fresh object of fresh closures each call (no `useCallback`/`useMemo`). They're attached to `<Stage>` so React reattaches them every frame — cheaper than the layer re-render but same root cause (camera state in render path).

**Fix (highest leverage):**
1. Make `ss`/`sh` stable identity. Pan never changes `stageScale`, so `ss` should NOT change across a pan gesture. Back them with a ref + stable `useCallback`:
   ```ts
   const ssRef = useRef((px: number) => px);
   ssRef.current = (px) => px / Math.max(ANNOTATION_SCALE_MIN, stageScaleRef.current);
   const ss = useCallback((px: number) => ssRef.current(px), []); // stable identity
   ```
   With stable `ss`, panning (which only mutates `stagePos`) no longer invalidates any layer memo.
2. Memoize `inputHandlers` in `usePlanInput` (they already read live values via refs, so closures can be stable).
3. Best structural fix: **stop routing pan through React state.** `movePan` → `setStagePos` re-renders the whole tree per mouse-move. Pan the Konva Stage imperatively instead (`stage.position(...)` + `stage.batchDraw()`) and only sync React state on pan-end. That removes per-frame React reconciliation entirely.

---

### H2: Every furniture object is a draggable `<Group>` on one interactive Layer — hit-graph + node count scale linearly, no virtualization

**File:** `src/app/components/editor/views/PlanView2D/FurnitureLayer.tsx:104-158`

**Why it causes lag:** Each furniture item renders a `<Group draggable>` with a `<Rect>` + `<Text>` (+ optional highlight/overlap Rects) on one `<Layer listening={isSelectMode}>`. With many objects:

- When `listening` is true (select mode), Konva maintains a **hit graph** — a second offscreen canvas. Every redraw of that layer redraws BOTH the scene canvas and the hit canvas for all N groups. `<Text>` nodes are particularly expensive.
- There is **no viewport culling / virtualization** — objects far outside the visible area are still in the scene graph and still drawn on every redraw.
- `perfectDrawEnabled={false}` is correctly set (good), but `shadowForStrokeEnabled` is not disabled, and the per-item `<Text>` label (`renderBody`, lines 75-82) is drawn for every object even when zoomed out so far the label is sub-pixel.

This is `O(N)` redraw cost per frame, multiplied by H1 (which triggers that redraw on every pan/zoom frame). Real in production.

**Fix:**
- **Cull off-screen furniture before mapping:** derive the visible world rect from `stagePos`/`stageScale`/viewport and `furniture.filter(inViewport)` before `.map`. Caps node count to what's visible.
- **Hide labels when zoomed out:** gate the `<Text>` in `renderBody` behind a scale threshold (you already do this for room/dimension labels via `DIM_HIDE_BELOW`). Text is the most expensive node type here.
- Set `shadowForStrokeEnabled={false}`.
- Consider splitting furniture into a static `listening={false}` layer (non-selected items) + a tiny interactive layer holding only the selected/dragging item, so the hit graph covers 1 node instead of N.

---

### H3: Too many Konva Layers (~9 stacked `<canvas>` elements)

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:236-241` (composition)

**Why it causes lag:** Actual `<Layer>` nodes rendered into the Stage:
- `RoomLayer` → 2 (`RoomLayer.tsx:30,40`)
- `WallLayer` → 2 (`WallLayer.tsx:164,178`)
- `FurnitureLayer` → 1 (`FurnitureLayer.tsx:104`)
- `HandleLayer` → 1 (`HandleLayer.tsx:36`)
- `DimensionLayer` → 2 (`DimensionLayer.tsx:35,70`)
- `OverlayLayer` → 1 axes layer + the tool's `renderOverlay()` returns its own `<Layer>` (`SelectTool.tsx:166`)

That is **~9-10 `<canvas>` DOM elements**. Konva guidance is 3-5 layers max; each is a full-size canvas the browser must composite. On large viewports this is significant GPU/compositor memory and per-frame compositing cost, and it compounds H1 because a full re-render touches all of them.

**Fix:** Merge layers that always redraw together and never need independent `listening` toggling:
- Merge the two `WallLayer` sublayers (outline `listening=false` + fill) — toggle `listening` per-shape (already done on outline lines).
- Merge the two `DimensionLayer` sublayers (both `listening=false`).
- Merge `RoomLayer`'s label sublayer (`listening=false`) into the annotation layer.
Target 3-4 total: [rooms+walls fill (interactive)] / [outlines+annotations (static)] / [furniture (interactive)] / [handles+overlay].

---

### H4: StrictMode double-renders everything — inflates localhost cost (dev-only)

**File:** `src/main.tsx:8-10`

**Why it matters for the user's question:** `<StrictMode>` intentionally double-invokes render and effect bodies in development. Every re-render in H1 happens **twice** on localhost. So dev lag is ~2x the production cost for the React-reconciliation portion (Konva canvas draws aren't doubled, but the JS map/diff work is). This is **dev-only** — it disappears in a production build.

**Fix:** No code change. To answer the worry directly: run `vite build && vite preview` (production bundle: no StrictMode double-render, minified, no source maps) and re-measure. The remaining lag is the "real" cost — and H1/H2/H3 are what must be fixed to make production scale. Do NOT remove StrictMode to "fix" perf; it masks nothing structural.

---

## Medium

### M1: `nodeById` / `wallSegments` memos are correct but only survive once H1 is fixed

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:189-199`

`nodeById` (memo on `[nodes]`) and `wallSegments` (memo on `[walls, nodeById, transform]`) are correct — `transform` is memoized on viewport only (line 65), so these are NOT busted by pan/zoom. They stay stable and don't bust child memos by themselves; the bus is `ss` (H1). After fixing H1, verify `wallSegments` doesn't rebuild on furniture-only changes (it depends on `walls`, not `furniture` — confirmed correct).

**Fix:** No change beyond H1; included for verification during the H1 fix.

### M2: `activeTool.update(ctx)` builds a fresh ~20-field `ctx` object every render

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:202-209`

A brand-new `ToolContext` literal is built and pushed into the active tool on **every** render, including every pan/zoom frame. Cheap-ish (no deep work) but allocates per frame in the hot path. After H1 reduces render frequency this is mitigated.

**Fix:** Acceptable once render frequency drops. If profiling still shows pressure, gate the rebuild or push only changed fields.

### M3: `selectedWallIds` change rebuilds every wall's props (N×5 closures) and re-maps the fill layer

**File:** `src/app/components/editor/views/PlanView2D/WallLayer.tsx:183-199` + `SelectTool.tsx:70-140`

Selecting one wall passes a new `selectedWallIds` Set (intentional memo-bust, `WallLayer.tsx:26-33`). That re-runs `walls.map`, and `getWallProps(wall)` allocates a fresh handlers object with 5 new closures per wall (`SelectTool.tsx:73-139`). For many walls, each selection click rebuilds N×5 closures. Correctness-fine, but O(walls) closure allocation per selection.

**Fix:** Only the selected/deselected wall actually changes color. Either (a) render the selected wall as a separate node, or (b) hoist stable handler closures out of `getWallProps` (read `wall.id` from the event target) so selection flips only `fill`/`stroke`, not handler identity.

### M4: Door-symbol generation re-runs whenever walls OR furniture change

**File:** `src/app/components/editor/views/PlanView2D/WallLayer.tsx:68-159`

`openingsByWall` (memo on `[furniture]`) and `doorSymbols` (memo on `[walls, openingsByWall, nodeById]`) do `atan2` + create up to 4 Konva elements per opening. Memoization is correct, but dragging one wall-item door changes the `furniture` reference each drag-end → full door-symbol rebuild for ALL doors, not just the moved one.

**Fix:** Acceptable at low door counts. If door count grows, key the memo per-wall so only the affected wall's symbols rebuild.

### M5: `useEffect` auto-clear of stale furniture selection runs on every `furniture` change

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:92-99`

Builds a `Set` of all furniture ids and filters the selection on every snapshot where `furniture` reference changes (every furniture drag-end). O(furniture) per change. Already optimized from O(sel×furn) to O(furn) (MD-04). Fine, just another O(N) pass tied to furniture mutations.

**Fix:** Acceptable. Already early-returns when `selectedFurnitureIds.size === 0`.

---

## Low

### L1: `topDownUrl` is computed and diffed but never rendered (dead path)

**File:** `src/app/store/useFloorPlanSnapshot.ts:142`, `SnapshotSystem.ts:218`, `FurnitureLayer.tsx:60-85`

`furnitureToPx` copies `topDownUrl`, `furnitureEq` (SnapshotSystem.ts:116) compares it, and the JSDoc in `FurnitureLayer.tsx:19-22` still describes a `subscribeImages()` image flow — but `renderBody` now draws only a Rect + Text (comment at lines 60-64 confirms top-down sprites were dropped). So `topDownUrl` is dead weight in the snapshot/diff path, and the `public/topdown/*.webp` loading concern from the brief is moot (no per-render `new Image()` exists).

**Fix:** Drop `topDownUrl` from `FurnitureSnapshot`/`Furniture2D`/`furnitureEq` to shrink per-object diff work, and delete the stale image JSDoc in `FurnitureLayer.tsx:19-22`.

### L2: Grid via CSS `backgroundImage` (good) but recomputed each render

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:228` + `usePlanCamera.ts:69-71`

`gridSizePx`/`gridOffsetX/Y` recompute each render and re-apply as inline style. Cheap, and correctly NOT a Konva layer (good — avoids an extra canvas). Noted so it isn't mistaken for a Konva redraw cost.

**Fix:** None required.

### L3: Inline style objects on root `<div>` and `<Stage>` reallocated each render

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:216, 228`

Large inline style literals are reallocated each render; the `<Stage>` style template interpolates grid values each frame. Negligible vs H1, but avoidable churn in the pan hot path.

**Fix:** Hoist static style fragments to module constants; only the dynamic grid background needs per-render computation.

---

## Prioritized action list (highest leverage first)

1. **Fix H1 — stabilize `ss`/`sh` identity and stop routing pan through React state.** Make `ss`/`sh` stable (ref-backed `useCallback`) so panning (which never changes scale) stops invalidating every layer's `React.memo`; ideally pan the Konva Stage imperatively (`stage.position()` + `batchDraw()`) and commit to React state only on pan-end. THE fix for "lag with many objects," and a production issue. Single biggest win.

2. **Fix H2 — viewport-cull furniture and hide labels when zoomed out.** `furniture.filter(inViewport)` before mapping; gate the per-object `<Text>` behind a zoom threshold. Caps per-frame node/draw cost to what's visible. Production issue.

3. **Fix H3 — collapse ~9 Konva layers to 3-4.** Merge always-`listening=false` annotation/outline sublayers; split furniture into a static (non-listening) layer + a tiny interactive selected-item layer so the hit graph covers 1 node, not N. Production issue.

4. **Verify with a production build (H4).** Run `vite build && vite preview` to strip StrictMode double-render + source maps and re-measure. Directly answers "will prod be worse?" — dev double-render is ~2x JS-side noise; what remains is H1/H2/H3.

5. **Cleanup (L1 + M3).** Drop dead `topDownUrl` from the snapshot diff path; hoist wall handler closures so selection doesn't reallocate N×5 closures per click. Lower leverage, removes steady-state churn.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
