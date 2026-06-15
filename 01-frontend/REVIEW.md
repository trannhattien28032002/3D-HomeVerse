---
review: performance
scope:
  - src/app/
  - src/engine/
reviewed: 2026-06-15
reviewer: Claude (adversarial performance review)
verdict: issues_found
findings:
  critical: 3
  high: 4
  medium: 5
  low: 3
  total: 15
---

# Performance Review — 3D HomeVerse Frontend (src/app + src/engine)

Adversarial performance pass over the React app and ECS/Three.js engine. The
engine core is, frankly, well-optimized: the ECS render/snapshot/wall/room/
collision systems all use a `world.revision` integer guard to skip work on idle
frames, snapshot arrays are reference-stable for React bail-out, geometry is
cached by hash, GLB templates are cached and cloned, and Konva layers are split +
`React.memo`'d with topology freezing during drag. That is genuinely good work.

The real performance problems are NOT in the per-frame engine logic. They are in
**asset delivery / bundle** (will absolutely lag on a deployed build), in **two
unguarded per-frame ECS systems**, and in the **unconditional postprocessing
render every frame**. These are the things that will hurt a real deployment.

Severity legend: Critical = will cause visible lag/jank or huge load times in
production; High = measurable cost under normal use; Medium/Low = smaller wins.

---

## CRITICAL

### CR-01 — 398 MB of textures shipped into the build; KTX2 deleted in git → multi-MB JPG fallback

> **STATUS: RESOLVED (2026-06-15).** `public/materials` reduced **398 MB → 45 MB** (−353 MB). Removed, in two passes:
> 1. All `*_NormalDX.jpg` (unreferenced — catalog uses NormalGL), all `.blend/.mtlx/.usdc/.tres` source artifacts, and redundant/unreferenced `.ktx2` variants.
> 2. ALL remaining `.jpg` (297 files, 211 MB): the ktx2→jpg fallbacks (color/normal/roughness/ao) AND the displacement/metalness/opacity maps — none were ever loaded at runtime (`MaterialLibrary` loads only color/normal/roughness/ao via ktx2; the jpg fallback only fires on a ktx2 error that never happens since all ktx2 are committed). The now-dead `displacement/metalness/opacity` keys were stripped from `materials.json` (73 lines) so no dangling references remain.
>
> Verified after both passes: every path referenced by `materials.json` + `MaterialLibrary` thumbnails (224 ktx2 + 56 webp) still exists; zero `.jpg` references remain in the catalog. ~840 files / 353 MB staged for commit.
>
> **Correction to original finding:** the referenced `.ktx2` were NOT missing from a clean deploy — they are all committed in HEAD. The git "deleted" entries were redundant *unreferenced* ktx2 variants from in-progress cleanup.
>
> **Follow-up (optional):** the ktx2→jpg fallback branch in `MaterialLibrary.tex()` (`MaterialLibrary.ts:156-201`) is now dead code (the jpgs are gone). Safe to simplify to ktx2-only loading.

**Files:**
- `public/materials/` (398 MB on disk)
- `src/data/catalog/materials.json` (paths point to `.ktx2`)
- `src/engine/rendering/MaterialLibrary.ts:156-201` (JPG fallback)

**Problem:**
`du -sh public/materials` = **398 MB**. Vite copies `public/` verbatim into
`dist/`. Per material folder there are full-size source artifacts that have no
business shipping to a browser:
- `*_NormalDX.jpg` / `*_NormalGL.jpg` ≈ **1.9 MB each**
- `*_Color.jpg` ≈ 835 KB, `*_AmbientOcclusion.jpg` ≈ 742 KB, `*_Roughness.jpg` ≈ 819 KB, `*_Displacement.jpg` ≈ 679 KB
- `*.blend` ≈ **1.1 MB**, plus `.mtlx`, `.usdc`, `.tres` per material (×63 materials)

Worse: every `.ktx2` file shows as **deleted in git** (see `git status`). They
still exist in your working tree, so it "works on my machine", but a clean deploy
/ CI checkout will NOT have them. `MaterialLibrary.tex()` then falls back to the
`.jpg`. Result on a real deploy: selecting one material downloads ~5 MB of raw
JPGs (color+normal+roughness+ao) instead of ~0.7 MB of KTX2 — and the GPU then
has to decode/upload uncompressed RGBA instead of GPU-native BasisU.

**Impact:** Multi-second stalls on every material pick on deploy; massive
`dist/` size; wasted CDN/bandwidth; GPU memory blowup from uncompressed textures.

**Fix:**
1. Commit the `.ktx2` files (un-delete) OR regenerate them in CI. Do not rely on
   the working tree.
2. Stop shipping source artifacts. Move `.blend/.mtlx/.usdc/.tres` and the raw
   `_NormalDX/_NormalGL/_Displacement/_Color/_AO/_Roughness.jpg` originals OUT of
   `public/`. Keep only the `.ktx2` (+ the small `.webp` thumbnails) that the app
   actually requests. Target: drop `public/materials` from 398 MB to well under
   ~20 MB.
3. The JPG fallback in `MaterialLibrary` is a correctness nicety but is loading
   the 1.9 MB `_NormalDX.jpg`. If KTX2 is the contract, make a missing KTX2 a
   build error, not a 1.9 MB runtime download.

---

### CR-02 — No route-level code splitting; the entire 3D/Konva engine is in the initial bundle

**File:** `src/app/routes/Routes.tsx:9-11`

**Problem:**
```ts
import HomePage from "src/app/pages/HomePage/HomePage";
import EditorPage from "src/app/pages/EditorPage/EditorPage";
import ProjectsPage from "src/app/pages/ProjectPage/ProjectsPage";
```
All three pages are statically imported. `EditorPage` transitively pulls in
`three`, all `three/addons` (OrbitControls, TransformControls, EffectComposer,
OutlinePass, EXRLoader, KTX2Loader, GLTFLoader, DRACOLoader), `konva` +
`react-konva`, and `cannon-es`. `vite.config.ts` has **no `build.rollupOptions.
manualChunks`** and no lazy boundaries. So a user landing on `/` (HomePage)
downloads and parses the full Three.js + Konva + Cannon stack before they ever
open the editor.

**Impact:** Largest-contentful-paint and time-to-interactive on the landing
page are dominated by code the landing page never uses. Three alone is ~600 KB+
min, Konva ~150 KB+, cannon-es ~120 KB+.

**Fix:**
```ts
import { lazy, Suspense } from "react";
const EditorPage = lazy(() => import("src/app/pages/EditorPage/EditorPage"));
// wrap routes in <Suspense fallback={<LoadingScreen/>}>
```
And add a vendor chunk split in `vite.config.ts`:
```ts
build: { rollupOptions: { output: { manualChunks: {
  three: ["three"], konva: ["konva", "react-konva"], cannon: ["cannon-es"],
}}}}
```

---

### CR-03 — `composer.render()` runs a full multi-pass postprocessing pipeline every frame, even when idle

**Files:**
- `src/engine/systems/scene/RenderSystem.ts:66`
- `src/engine/engine.ts:149-157` (uncapped rAF loop)

**Problem:**
The `loop()` calls `world.update(dt)` every animation frame with no idle gating,
and `RenderSystem.update()` always runs:
```ts
this.composer.render(deltaTime); // RenderPass + OutlinePass + OutputPass, every frame
```
The mesh-sync is revision-guarded, but the **render itself is not**. That means
even with a static scene and no camera motion, the GPU runs RenderPass →
OutlinePass (which does multiple depth/edge passes) → OutputPass at full
`devicePixelRatio` (set to `window.devicePixelRatio`, so 2x–3x on HiDPI/4K) at
the display refresh rate (often 120 Hz on modern laptops). OutlinePass is one of
the more expensive built-in passes; running it forever when nothing is selected
and nothing moves is pure waste — it pins a GPU core, heats the machine, and
drains laptop battery.

**Impact:** Constant GPU load and fan spin on an idle editor; on integrated GPUs
this competes with React/Konva and causes 2D drag jank.

**Fix (pick one or combine):**
- **On-demand rendering:** only `composer.render()` when something changed —
  track `world.revision` change OR an `orbitControls`/camera `dirty` flag (the
  damping in OrbitControls means you render until it settles, then stop).
- Skip OutlinePass entirely when `outlinePass.selectedObjects.length === 0`
  (swap to a plain `renderer.render` fast path, or set the pass `enabled=false`).
- Clamp `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` —
  rendering MSAA half-float + OutlinePass at 3x DPR on a 4K screen is enormous
  fill-rate for no visible benefit.

---

## HIGH

### HG-01 — `DimensionSystem` runs every frame with full allocation, no revision guard

**File:** `src/engine/systems/annotation/DimensionSystem.ts:40-73`

**Problem:** Unlike `RenderSystem`, `SnapshotSystem`, `WallGeometrySystem`,
`RoomSystem`, and `CannonCollisionSystem` — which all early-return on
`world.revision === this._lastRevision` — `DimensionSystem.update()` has **no
guard**. Every frame it runs `Query.entitiesWith(WallTag, WallNodes)`, allocates
a fresh `dims: DimensionSnapshot[]`, a fresh `Map`, then `computeAngleDimensions`
allocates another array and iterates every node, builds a `dirs[]` array per
node, and `.sort()`s it. This produces garbage every single frame regardless of
whether anything changed.

**Impact:** Continuous GC pressure (multiple array+map+object allocations per
frame at refresh rate) and wasted CPU proportional to wall/node count, forever.
This is the single biggest per-frame CPU regression vs the rest of the engine,
which is otherwise idle-clean.

**Fix:** Add the same guard the sibling systems use:
```ts
private _lastRevision = -1;
update(world: World): void {
  if (world.revision === this._lastRevision) return;
  // ... existing body ...
  this._lastRevision = world.revision;
}
```
Because `SnapshotSystem` reads `dimSystem.lastDimensions` and runs after
DimensionSystem with the *same* revision guard, this is safe: when revision is
unchanged, the previous `lastDimensions` is still valid.

---

### HG-02 — `LightSystem` re-queries and re-applies lights every frame

**File:** `src/engine/systems/scene/LightSystem.ts:28-105`

**Problem:** No revision guard. Every frame it runs two `Query.entitiesWith`
calls (allocating result arrays), iterates them, and re-sets `color`,
`intensity`, and `position` on the Three lights even though lights essentially
never change after creation. Lazy-create is fine, but the steady-state path
writes to the lights on every one of the ~60–120 frames/sec.

**Impact:** Minor CPU + 2 array allocations/frame forever. Small, but it is
exactly the kind of "death by a thousand cuts" the rest of the engine avoids.

**Fix:** Add the `_lastRevision` guard (lights are created via `addComponent`,
which bumps revision, so the first frames still run; once stable it skips). If
you want directional light to follow a moving `Transform`, keep it but gate on
revision (Transform mutation bumps/`markDirty`s revision anyway).

---

### HG-03 — Furniture rendered as individually-cloned GLB scene graphs; no instancing, every mesh casts+receives shadow

**Files:**
- `src/engine/game/FurnitureFactory.ts:116-135` (`template.scene.clone(true)`)
- `src/engine/game/FurnitureFactory.ts:130-135` / `226-231` (`castShadow=receiveShadow=true` on every child mesh)

**Problem:** Each placed item is `template.scene.clone(true)` — a fresh subtree
of `THREE.Mesh` nodes added to the scene. Geometry is shared (good), but every
clone is a separate draw call per material, and every mesh has both
`castShadow=true` and `receiveShadow=true`. With a directional shadow-casting
light (`engine.ts:93`, `LightFactory`), the shadow map re-renders all
shadow-casters. A scene with 30–50 furniture items + walls + caps + floors can
easily hit hundreds of draw calls and a heavy shadow pass — on top of CR-03's
always-on OutlinePass.

**Impact:** Draw-call and shadow-pass cost scales linearly with item count;
combined with CR-03 this is where a "full room" deploy will start dropping
frames during orbit.

**Fix:**
- Don't make every small object a shadow caster. Reserve `castShadow` for large
  items; set `receiveShadow` only on floors/walls. This alone can halve shadow
  cost.
- For repeated identical models (chairs, plants), consider `InstancedMesh` or at
  least merging static geometry. Lower priority than the cast/receive fix.

---

### HG-04 — `studio.exr` HDRI is a 3.4 MB uncompressed EXR loaded eagerly at engine boot

**File:** `src/engine/setup/sceneSetup.ts:52-59`

**Problem:** `EXRLoader().load("/studio.exr")` downloads a **3.4 MB** EXR on
every editor open, then runs `PMREMGenerator.fromEquirectangular` (a GPU
prefilter) synchronously in the load callback. EXR is uncompressed float; this is
a large blocking-ish asset for an environment map that is mostly providing
ambient reflection.

**Impact:** 3.4 MB added to editor first-load + a PMREM GPU spike at boot.

**Fix:** Convert the environment to a compressed HDR (`.hdr` RGBE is far smaller)
or a small KTX2/`.hdr` at lower resolution (512–1024 equirect is plenty for
reflection). Could also defer it one frame after first render so the scene paints
first.

---

## MEDIUM

### MD-01 — `objects.json` (118 KB) imported into the JS bundle, not fetched

**Files:**
- `src/app/components/editor/panels/DecorCatalog/catalogData.ts:1`
- `src/engine/rendering/MaterialLibrary.ts:3` (`materials.json` 36 KB)

**Problem:** `import objectsData from ".../objects.json"` inlines 118 KB of JSON
into the JS chunk (parsed eagerly at module load). `materials.json` adds another
36 KB. These are catalog data that could be `fetch`'d on demand.

**Impact:** ~155 KB of JSON parsed at startup and bundled; grows with catalog.

**Fix:** Either move to `fetch('/data/objects.json')` lazily when the Decor panel
first opens, or accept the bundle cost but ensure it lands in a lazy editor
chunk (depends on CR-02 fix).

---

### MD-02 — `OrbitControlSystem` raycasts the entire scene recursively on every wheel tick while zooming

**File:** `src/engine/systems/scene/OrbitControlSystem.ts:238-274`

**Problem:** While `|zoomDelta| > 0.0001` (i.e. the whole inertial zoom decay),
each frame does `this.raycaster.intersectObjects(this.scene.children, true)` —
recursive over the full scene graph including every GLB subtree, the grid helper,
axes helper, etc. `onDoubleClick` (line 140) does the same. Raycasting all
descendants of all furniture is `O(total triangles tested)` per zoom frame.

**Impact:** Zoom becomes progressively janky as the room fills with detailed GLB
models, because the zoom-to-cursor raycast walks every triangle.

**Fix:** Raycast against a curated list (floor + a coarse pick layer / bounding
proxies) instead of `scene.children` recursive, or raycast only the ground plane
for zoom-to-cursor and skip mesh hit-testing during the inertial decay frames.

---

### MD-03 — `WallLayer` rebuilds an `openingsByWall` Map on every render (not memoized)

**File:** `src/app/components/editor/views/PlanView2D/WallLayer.tsx:66-74`

**Problem:** `WallLayerInner` builds `openingsByWall = new Map()` by scanning all
`furniture` on every render. The component is `React.memo`'d so it only re-renders
when props change, but `furniture` changes on every furniture drag/placement, and
the door-symbol `flatMap` over walls×openings then recomputes `wallBasis2D`,
arctans, and constructs several Konva elements each time.

**Impact:** Moderate; only when furniture changes, but that's during active
editing. Allocates a Map + arrays per wall every wall-layer render.

**Fix:** `const openingsByWall = useMemo(() => {...}, [furniture])`. The door
symbol JSX block could also be memoized on `[walls, furniture, nodeById]`.

---

### MD-04 — `PlanView2D.useEffect` does an O(furniture × selection) scan on every snapshot

**File:** `src/app/components/editor/views/PlanView2D/index.tsx:92-96`

**Problem:**
```ts
const alive = [...selectedFurnitureIds].filter(id => furniture.some(f => f.entityId === id));
```
`furniture.some(...)` inside `.filter(...)` is O(selected × furniture). It runs in
a `useEffect` keyed on `[furniture, ...]`, so it fires every time the furniture
collection reference changes (every furniture move during editing). With many
items + multi-select this is quadratic per snapshot.

**Impact:** Small for typical counts, but it's quadratic and runs on the hot
editing path.

**Fix:** Build a `Set` of live entity ids once: `const live = new Set(furniture.map(f=>f.entityId))` then `filter(id => live.has(id))`.

### MD-05 — `serializeScene` runs on every transaction begin AND on every undo/redo

**Files:**
- `src/engine/engine.ts:118-124, 183-198, 213-238`

**Problem:** `beginTransaction`/`transaction`/`asyncTransactionFn` call
`serializeScene(inst)` to snapshot the whole scene, and `undo()`/`redo()` call it
again to capture the redo/undo counterpart. For furniture drag the code wisely
uses command-inverse (`recordMoveUndo`) instead, but any transaction-based edit
(wall property change, placement) serializes the entire `SceneDocument`. If the
scene is large this is a full deep walk + object allocation on each such edit.

**Impact:** Noticeable hitch on undo/redo and on transaction-based edits in a
large scene; not per-frame, so lower priority.

**Fix:** Already partially mitigated by command-inverse for hot paths. Consider
extending command-inverse to wall edits, or making serialize incremental. Fine to
leave for now if scenes stay small.

---

## LOW

### LW-01 — `renderer.setPixelRatio(window.devicePixelRatio)` uncapped

**File:** `src/engine/setup/sceneSetup.ts:42`
Covered under CR-03; on a 4K/Retina display this renders 4–9× the pixels.
Cap at 2. Quick, high-value one-liner.

### LW-02 — `AxesHelper(100)` and `GridHelper(50,100)` always in the scene and raycastable

**File:** `src/engine/setup/sceneSetup.ts:18-28`
The 100-division grid (200 line segments) and axes are permanent scene children,
so they're also walked by the recursive raycasts in MD-02. Set
`gridHelper.raycast = () => {}` / exclude from pick lists, and consider hiding the
axes helper in production.

### LW-03 — `getBoundingClientRect()` called on every mousedown/mousemove

**Files:**
- `src/engine/systems/scene/OrbitControlSystem.ts:123` (every mousemove)
- `src/engine/systems/gizmo/GizmoSystem.ts:391, 517`

**Problem:** `getBoundingClientRect()` forces layout if anything invalidated it;
calling it on every `mousemove` (OrbitControlSystem.onMouseMove) is a potential
forced-reflow on the hot pointer path.

**Fix:** Cache the rect and invalidate on `resize`/scroll rather than reading it
per mousemove.

---

## Bottom line (tiếng Việt)

**Có vấn đề performance không?**
Có, nhưng KHÔNG nằm ở chỗ mọi người hay lo. Phần lõi engine ECS (render loop,
snapshot, wall/room/collision systems) đã được tối ưu rất tốt: có revision-guard
bỏ qua frame idle, snapshot reference-stable, cache geometry theo hash, GLB cache
+ clone, Konva tách layer + React.memo + freeze topology khi drag. Đây là code
sạch về per-frame logic.

Vấn đề thật sự nằm ở 3 nhóm:
1. **Asset/bundle (nghiêm trọng nhất khi deploy):** `public/materials` nặng
   **398 MB** (kèm cả `.blend`, normal map JPG 1.9 MB/cái...). File `.ktx2` đang
   bị xoá trong git → deploy sạch sẽ thiếu KTX2 và fallback sang JPG nhiều MB.
   `studio.exr` 3.4 MB load lúc mở editor. JSON catalog (objects 118 KB +
   materials 36 KB) nhét thẳng vào bundle.
2. **Không code-splitting:** `Routes.tsx` import tĩnh cả `three` + `konva` +
   `cannon-es` → landing page tải nguyên stack 3D dù không dùng.
3. **2 system per-frame chưa guard + render postprocessing chạy mãi:**
   `DimensionSystem` và `LightSystem` chạy + cấp phát mảng mỗi frame; và
   `composer.render()` (RenderPass + OutlinePass + OutputPass) chạy mỗi frame kể
   cả khi cảnh đứng yên, ở pixelRatio không giới hạn.

**Đã tối ưu / đủ nhanh chưa?**
Engine logic: đã tối ưu tốt. Asset delivery + bundle: CHƯA — đây là phần làm
deploy chậm/lag rõ rệt. Render loop: chưa, vì luôn render full postprocessing.

**Nếu deploy thì có lag không, và ở đâu?**
Có, và ở những chỗ rất cụ thể:
- **Load lần đầu:** rất nặng (bundle có toàn bộ Three/Konva/Cannon + JSON; nếu
  build kéo theo cả `public/materials` 398 MB thì `dist` khổng lồ). → CR-01, CR-02.
- **Mở editor:** tải `studio.exr` 3.4 MB + PMREM spike. → HG-04.
- **Chọn material:** nếu thiếu KTX2 → tải ~5 MB JPG/material, stall vài giây +
  phình VRAM. → CR-01.
- **Khi cảnh đứng yên:** GPU vẫn chạy OutlinePass mãi (nóng máy/tụt pin, đặc biệt
  màn 4K do pixelRatio không cap). → CR-03, LW-01.
- **CPU per-frame:** `DimensionSystem`/`LightSystem` cấp phát rác mỗi frame mãi
  mãi → áp lực GC. → HG-01, HG-02.
- **Phòng nhiều đồ + orbit/zoom:** số draw call + shadow pass tăng tuyến tính
  (mọi mesh castShadow), và zoom raycast cả scene đệ quy mỗi frame → khựng. →
  HG-03, MD-02.

Ưu tiên sửa theo thứ tự: CR-01 → CR-02 → CR-03 → HG-01 → HG-02. Năm cái này gỡ
gần hết lag thực tế khi deploy.
