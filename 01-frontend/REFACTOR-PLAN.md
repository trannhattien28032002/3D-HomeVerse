# Frontend Refactor Plan — 3D Interior Design v1.0

**Scope:** `3D-HomeVerse/01-frontend/src/`
**Mục tiêu:** Cải thiện **dễ đọc** (readability) và **dễ xử lý** (workability) thông qua tách god-files, gộp logic duplicate, sắp xếp lại folder theo concern rõ ràng.
**Tổng effort:** ~50h ≈ 6–7 ngày làm việc 1 dev.
**Nguồn:** Tổng hợp từ 3 vòng architectural review (general → readability/workability → refactor planning).

---

## Tóm tắt vấn đề (baseline)

| Pain | Bằng chứng |
|---|---|
| God-file dispatcher | `engine/commands/dispatcher.ts` 786 LOC, 12 case, `MERGE_NODE` 124 LOC nesting 7 cấp, switch không `default:` |
| God-component 2D | `app/components/editor/PlanView2D.tsx` 647 LOC, 8 Konva Layer inline, 7 useState, 5 useEffect |
| Snap/rotation constants duplicate | 4 chỗ: `PlacementAssistSystem`, `FurniturePlacementSystem.ts:12`, `PlaceFurnitureTool.tsx:13`, `PlanView2D.tsx:62-63` |
| Footprint resolution duplicate | 3 chỗ: `SnapshotSystem.ts:103-117`, `FurnitureFactory.ts:127`, `FurniturePlacementSystem.ts:237` |
| Collision impl song song | `collision2D.ts` (SAT pixel, gap 0.5px) vs `CannonCollisionSystem` (boxBox metres, gap 0.002m) — kết quả mâu thuẫn |
| Shadow registries GC scattered | `MeshRegistry`, `ModelRegistry`, `CannonCollisionSystem.entries` — cleanup rải rác trong dispatcher |
| Add 1 tool = sửa 5–6 chỗ | `ToolBase` impl + `useUIStore.ts:34` + `PlanView2D.tsx:127-129` + `EditorPage.tsx:57` + `usePlanShortcuts.ts:18` + `BottomNavBar` |
| Naming misleading | `useFloorPlanStore` thực ra là custom hook, không phải Zustand store |
| `coords.ts` lệch concern | Nằm trong `engine/utils/` nhưng thực ra là pure shared util |
| README 404 | `README.md:91-95` link 5 file `docs/*.md` đều không tồn tại |
| Hop thừa | `useEngineDispatch` wrapper chỉ null-check + warn |

---

## Phần 1 — Folder Responsibility Map (Target State)

```
src/
├── shared/                            ← MỚI: pure, framework-free
│   ├── math/
│   │   ├── coords.ts                  Owns: pixel↔meter, world↔plan transforms
│   │   ├── geometry.ts                Owns: SAT, OBB, segment-segment intersect, polygon ops
│   │   └── vector.ts                  Owns: v2/v3 helpers
│   ├── constants/
│   │   ├── placement.ts               Owns: SNAP_M, ROT_STEP_DEG, GHOST_OPACITY (single source)
│   │   ├── grid.ts                    Owns: GRID_SIZE, GRID_DIVISIONS, METER_PX
│   │   └── ui.ts                      Owns: cursor names, z-index layers, color palette
│   └── types/
│       └── primitives.ts              Owns: Vec2, Vec3, Bounds, Quat
│
├── engine/                            ← Framework-free, không import React/Konva/Three runtime
│   ├── ecs/                           Owns: World, System, Query, Component
│   ├── components/                    Owns: Transform, ColliderAABB, ColliderOBB (ECS data)
│   ├── commands/
│   │   ├── EngineCommands.ts          Owns: discriminated union type
│   │   ├── dispatcher.ts              Owns: ONLY router — switch + delegate (~120 LOC)
│   │   ├── history.ts                 Owns: undo/redo stack
│   │   └── handlers/                  ← MỚI
│   │       ├── wallHandlers.ts        Owns: ADD/DELETE/MOVE/MERGE wall + RESOLVE_INTERSECTIONS
│   │       ├── furnitureHandlers.ts   Owns: PLACE/MOVE/ROTATE/DELETE furniture
│   │       ├── selectionHandlers.ts   Owns: SELECT/DESELECT/HOVER
│   │       ├── sceneHandlers.ts       Owns: LOAD_SCENE, RESET, SET_PROJECT
│   │       └── wallTopology.ts        (move vào — đã có precedent handleSplitWall)
│   ├── systems/                       Owns: per-tick logic (giữ nguyên cấu trúc, split file >300 LOC)
│   ├── game/
│   │   ├── FurnitureFactory.ts
│   │   ├── FurnitureCatalog.ts
│   │   └── getFootprint.ts            ← MỚI (single source thay cho 3 nơi duplicate)
│   ├── placement/                     ← MỚI: gom logic validate placement (2D + 3D)
│   │   ├── validatePlacement.ts       Owns: SAT-based collision check, engine-level
│   │   └── snapToGrid.ts              Owns: snap rotation/position helpers
│   ├── registries/                    ← MỚI: GC orchestration tập trung
│   │   ├── MeshRegistry.ts
│   │   ├── ModelRegistry.ts
│   │   └── EntityRegistry.ts          Owns: disposeEntity(id) gọi cleanup cả 3
│   ├── graph/                         Owns: NodeRegistry, RoomDetection
│   ├── events/                        Owns: EngineEvents bus
│   ├── serialization/                 Owns: serialize/deserialize/validate
│   ├── setup/                         Owns: systemSetup, sceneSetup
│   ├── rendering/                     Owns: GLTFModelLoader
│   ├── engine.ts                      Owns: orchestrator + public API
│   └── engineTypes.ts
│
├── app/                               ← React UI layer
│   ├── pages/                         Owns: top-level routed pages
│   ├── components/
│   │   ├── common/                    Owns: cross-feature widgets
│   │   └── editor/
│   │       ├── Canvas.tsx
│   │       ├── SceneView3D.tsx
│   │       ├── BottomNavBar.tsx
│   │       ├── TopNavBar.tsx
│   │       ├── PlanView2D/            ← MỚI (folder thay vì 1 file 647 LOC)
│   │       │   ├── index.tsx          Owns: Stage + composition (~120 LOC)
│   │       │   ├── RoomLayer.tsx      Owns: render rooms
│   │       │   ├── WallLayer.tsx      Owns: render walls + nodes
│   │       │   ├── FurnitureLayer.tsx Owns: render furniture top-down sprites
│   │       │   ├── HandleLayer.tsx    Owns: drag/rotate handles
│   │       │   ├── DimensionLayer.tsx Owns: linear + angular dimensions
│   │       │   ├── OverlayLayer.tsx   Owns: hover/ghost/snap indicators
│   │       │   ├── usePlanCamera.ts   Owns: pan/zoom state hook
│   │       │   └── usePlanInput.ts    Owns: stage event → tool dispatch
│   │       ├── DecorCatalog/          ← MỚI (folder thay file)
│   │       │   ├── index.tsx
│   │       │   ├── CategoryTabs.tsx
│   │       │   ├── CatalogGrid.tsx
│   │       │   ├── CatalogItem.tsx
│   │       │   ├── catalogData.ts
│   │       │   └── sprite.ts          (gộp furnitureImages + furnitureSprite)
│   │       ├── projection2d/          ← MỚI: 2D-only render math
│   │       │   ├── wallToPolygon.ts   Owns: wall metres → Konva pixel poly
│   │       │   └── furnitureToSprite.ts Owns: furniture pose → sprite x/y/rot
│   │       └── tools/
│   │           ├── ToolBase.ts
│   │           ├── toolRegistry.ts    ← MỚI: single map {id → Tool}
│   │           ├── DrawWallTool.tsx
│   │           ├── SelectTool.tsx
│   │           ├── PlaceFurnitureTool.tsx
│   │           └── toolUtils.ts
│   ├── store/
│   │   ├── useUIStore.ts              Owns: ACTIVE Zustand store
│   │   └── useFloorPlanSnapshot.ts    ← RENAMED từ useFloorPlanStore
│   ├── hooks/
│   │   └── usePlanShortcuts.ts        (useEngineDispatch DELETED)
│   └── engine/
│       └── EngineContext.tsx
│
└── docs/                              ← MỚI (fix README 404)
    ├── architecture.md
    └── command-flow.md
```

---

## Phần 2 — Split Plan (god-files → nhiều file nhỏ)

| Source | LOC | Tách thành | LOC sau | Lý do | Effort | Breaking? |
|---|---|---|---|---|---|---|
| `engine/commands/dispatcher.ts` | 786 | `dispatcher.ts` (router only) | ~120 | Switch chỉ delegate, có `default: assertNever` | 1h | Không |
| | | `handlers/wallHandlers.ts` (ADD/DELETE/MOVE/MERGE + RESOLVE_INTERSECTIONS) | ~280 | Gom 4 case wall + reuse `wallTopology.handleSplitWall` pattern | 4h | Không |
| | | `handlers/furnitureHandlers.ts` (PLACE/MOVE/ROTATE/DELETE) | ~180 | Async PLACE_FURNITURE cô lập, dễ test | 3h | Không |
| | | `handlers/selectionHandlers.ts` | ~60 | | 1h | Không |
| | | `handlers/sceneHandlers.ts` (LOAD/RESET/SET_PROJECT) | ~80 | | 1h | Không |
| `app/components/editor/PlanView2D.tsx` | 647 | `PlanView2D/index.tsx` (composition) | ~120 | Stage + Layer order, không inline JSX nặng | 2h | **Có** (import path đổi từ file → folder index) |
| | | `RoomLayer.tsx` | ~80 | 1 Layer = 1 component | 1.5h | Không |
| | | `WallLayer.tsx` | ~140 | | 2h | Không |
| | | `FurnitureLayer.tsx` | ~120 | | 2h | Không |
| | | `HandleLayer.tsx` | ~90 | | 1.5h | Không |
| | | `DimensionLayer.tsx` | ~90 | Linear + angular gộp chung concern | 1.5h | Không |
| | | `OverlayLayer.tsx` | ~70 | hover/ghost/snap | 1h | Không |
| | | `usePlanCamera.ts` (hook) | ~50 | Tách pan/zoom/cursor ra hook | 1h | Không |
| | | `usePlanInput.ts` (hook) | ~80 | Tách inline arrow handler, gọi `toolRegistry` | 2h | Không |
| `engine/systems/WallGeometrySystem.ts` | 443 | `WallGeometrySystem.ts` (shell) | ~180 | System chỉ orchestrate | 2h | Không |
| | | `wallMeshBuilder.ts` | ~150 | Hàm thuần build geometry — dễ test | 2h | Không |
| | | `wallCornerJoiner.ts` | ~120 | Logic miter/join góc tường | 2h | Không |
| `engine/systems/CannonCollisionSystem.ts` | 425 | `CannonCollisionSystem.ts` (lifecycle) | ~180 | Giữ ECS system | 1.5h | Không |
| | | `cannonBodyFactory.ts` | ~120 | Tạo body từ ColliderAABB/OBB | 1.5h | Không |
| | | `placement/validatePlacement.ts` (move ra) | ~130 | Dùng được cho cả 2D và 3D | 2h | **Có** (PlaceFurnitureTool đổi import) |
| `engine/systems/GizmoSystem.ts` | 338 | `GizmoSystem.ts` | ~180 | | 1h | Không |
| | | `gizmoHandles.ts` | ~160 | Logic vẽ handle riêng | 2h | Không |
| `app/components/editor/DecorCatalog.tsx` | 507 | `DecorCatalog/index.tsx` | ~140 | List + filter shell | 2h | **Có** (import folder index) |
| | | `CategoryTabs.tsx` | ~80 | | 1h | Không |
| | | `CatalogGrid.tsx` | ~120 | | 1.5h | Không |
| | | `CatalogItem.tsx` | ~90 | | 1h | Không |
| | | `catalogData.ts` | ~80 | Tách data khỏi UI | 1h | Không |

**Tổng split: ~33h.**

---

## Phần 3 — Merge / Consolidate Plan

| Files hiện tại (gộp) | Target file | Lý do gộp | Effort |
|---|---|---|---|
| SNAP/ROT constants ở 4 file (`PlacementAssistSystem`, `FurniturePlacementSystem.ts:12`, `PlaceFurnitureTool.tsx:13`, `PlanView2D.tsx:62-63`) | `shared/constants/placement.ts` | Đang duplicate 4 chỗ — sửa 1 quên 3 là bug | **1.5h** |
| Footprint resolution ở `SnapshotSystem.ts:103-117`, `FurnitureFactory.ts:127`, `FurniturePlacementSystem.ts:237` | `engine/game/getFootprint.ts` (1 hàm `getFootprint(entityId, world)`) | Logic giống nhau, kết quả phải đồng bộ tuyệt đối — hiện đang risk drift | **2h** |
| `collision2D.ts` (SAT pixel) + `CannonCollisionSystem.checkOverlap` (boxBox metres) | `engine/placement/validatePlacement.ts` (1 hàm `validatePlacement(pose, footprint, world) → {ok, reason}`) | 2 impl song song với 2 gap khác nhau → kết quả mâu thuẫn. Engine-level dùng metres, 2D adapter call qua `coords` | **4h** |
| `MeshRegistry`, `ModelRegistry`, `CannonCollisionSystem.entries` cleanup rải rác trong dispatcher | `engine/registries/EntityRegistry.ts` (1 method `disposeEntity(id)` orchestrate cả 3) | Dispatcher đang phải nhớ GC 3 chỗ — thêm registry thứ 4 là quên | **3h** |
| `useEngineDispatch.ts` wrapper (chỉ check null + warn) | Inline vào `engine.api.dispatch` — **xoá** | Hop thừa, mỗi component đang `const dispatch = useEngineDispatch()` không value-add | **1h** |
| `furnitureImages.ts` + `furnitureSprite.tsx` | `app/components/editor/DecorCatalog/sprite.ts` | 2 file cùng concern catalog asset | **1h** |
| Switch tool ở `useUIStore:34` (union), `PlanView2D:127-129`, `EditorPage:57`, `usePlanShortcuts:18`, `BottomNavBar` | `app/components/editor/tools/toolRegistry.ts` (single map `{id: {tool, icon, shortcut, label}}`) | Add tool đang phải sửa 5-6 chỗ — registry pattern giảm còn 1 chỗ | **4h** |

**Tổng merge: ~16.5h.**

---

## Phần 4 — Move / Rename Plan

| From | To | Lý do | Effort | Breaking imports? |
|---|---|---|---|---|
| `engine/utils/coords.ts` | `shared/math/coords.ts` | Pure util, không phụ thuộc engine — 2D layer và engine cùng dùng | 0.5h | **Có** (mọi import đổi — codemod được) |
| `engine/utils/wallHelpers.ts` | `engine/commands/handlers/wallHelpers.ts` | Chỉ wall handlers dùng — nên gần consumer | 0.5h | **Có** |
| `app/store/useFloorPlanStore.ts` | `app/store/useFloorPlanSnapshot.ts` | File không phải Zustand store, là hook đọc snapshot. Tên hiện tại đánh lừa reviewer | 0.5h | **Có** |
| `engine/systems/CannonCollisionSystem` cleanup logic | `engine/registries/EntityRegistry.disposeEntity()` | Dispatcher không nên biết Cannon body API | 1.5h | Không (private refactor) |
| `MeshRegistry`, `ModelRegistry` (rải rác trong setup/rendering) | `engine/registries/` (folder mới) | Đặt cùng concern: shadow registry lifecycle | 1h | **Có** |
| `furnitureImages.ts`, `furnitureSprite.tsx` (ở `components/editor/`) | `components/editor/DecorCatalog/` | Chỉ DecorCatalog dùng — đưa vào sub-folder feature | 0.5h | **Có** |
| Tạo `docs/architecture.md`, `docs/command-flow.md` | `docs/` | Fix README link 404 | 2h | Không |

**Tổng move/rename: ~6.5h.**

---

## Phần 5 — Sequencing (7 đợt, đúng thứ tự bắt buộc)

### Đợt 1 — Foundation: shared/ + constants (Ngày 1, ~4h)
- **Mục tiêu:** Tạo `src/shared/{math,constants,types}/`. Move `coords.ts` về. Gộp 4 chỗ snap/rotation constants vào `placement.ts`.
- **Exit criteria:** 4 file consumer (`PlacementAssist`, `FurniturePlacement`, `PlaceFurnitureTool`, `PlanView2D`) đều `import { SNAP_M, ROT_STEP_DEG } from '@/shared/constants/placement'`. Grep không còn literal `0.25` magic number.
- **Risk nếu skip:** Mọi đợt sau cần shared constants — skip thì đợt 3 (handlers) lại tạo constants cục bộ, lặp lại lỗi cũ.

### Đợt 2 — Engine helpers consolidation (Ngày 1–2, ~6h)
- **Mục tiêu:** Tạo `engine/game/getFootprint.ts`, `engine/placement/validatePlacement.ts`, `engine/registries/EntityRegistry.ts`.
- **Exit criteria:** 3 chỗ footprint duplicate đều call `getFootprint()`. 2 collision impl chỉ còn 1. Dispatcher không trực tiếp gọi `MeshRegistry.delete()` / `ModelRegistry.delete()` nữa — chỉ gọi `EntityRegistry.disposeEntity(id)`.
- **Risk nếu skip:** Đợt 3 split dispatcher xong vẫn còn boilerplate GC 3 dòng/handler. Tách handler không sạch.

### Đợt 3 — Split dispatcher (Ngày 2–3, ~10h)
- **Mục tiêu:** Tách `dispatcher.ts` thành 1 router + 4 handler file theo Phần 2.
- **Exit criteria:** `dispatcher.ts` < 150 LOC, có `default: assertNever(cmd)`. Mỗi handler file < 300 LOC. Test undo/redo + 1 round-trip serialize không regress.
- **Risk nếu skip:** Mỗi command mới vẫn thêm 1 case vào file 800 LOC, merge conflict thường xuyên, async `PLACE_FURNITURE` tiếp tục ẩn race condition.

### Đợt 4 — Rename + store cleanup (Ngày 3, ~3h)
- **Mục tiêu:** `useFloorPlanStore` → `useFloorPlanSnapshot`. Xoá `useEngineDispatch` wrapper, inline `engine.api.dispatch`.
- **Exit criteria:** Grep `useFloorPlanStore` = 0. Grep `useEngineDispatch` = 0. CI build pass.
- **Risk nếu skip:** Đợt sau làm thêm component, lại có người tưởng `useFloorPlanStore` là Zustand store, viết `.setState()` → lỗi runtime.

### Đợt 5 — Tool registry (Ngày 4, ~4h)
- **Mục tiêu:** Tạo `tools/toolRegistry.ts` — single map `id → {tool, icon, shortcut, label}`. Xoá 5–6 chỗ switch.
- **Exit criteria:** Add 1 tool dummy chỉ cần sửa registry — `EditorPage`, `BottomNavBar`, `usePlanShortcuts`, `PlanView2D` không cần đổi.
- **Risk nếu skip:** Đợt 6 split PlanView2D xong vẫn nhúng switch tool — sub-component sẽ bị couple ngược lên union type.

### Đợt 6 — Split PlanView2D (Ngày 4–5, ~13h)
- **Mục tiêu:** `PlanView2D.tsx` → folder `PlanView2D/` với 7 sub-component + 2 hook + folder `projection2d/`.
- **Exit criteria:** `PlanView2D/index.tsx` < 150 LOC. Mỗi Layer file < 150 LOC. Visual regression test (screenshot) khớp.
- **Risk nếu skip:** Đợt 7 add feature mới (ví dụ angle dimensions v2) lại nhúng inline vào file 650 LOC.

### Đợt 7 — Long-tail splits + docs (Ngày 6, ~10h)
- **Mục tiêu:** Split `WallGeometrySystem`, `CannonCollisionSystem`, `GizmoSystem`, `DecorCatalog`. Viết `docs/architecture.md`, `docs/command-flow.md`.
- **Exit criteria:** File > 300 LOC = 0 (trừ data file). README link không còn 404.
- **Risk nếu skip:** Onboarding dev mới vẫn mất 2–3 ngày đọc 3 file 400+ LOC.

---

## Phần 6 — Folder Tree Diff (BEFORE → AFTER)

```
BEFORE (hiện tại)                          AFTER (target)
─────────────────────────────────         ──────────────────────────────────
src/                                       src/
                                           ├── shared/                    ← MỚI
                                           │   ├── math/
                                           │   │   ├── coords.ts          (move từ engine/utils)
                                           │   │   ├── geometry.ts
                                           │   │   └── vector.ts
                                           │   ├── constants/
                                           │   │   ├── placement.ts       (gộp 4 chỗ duplicate)
                                           │   │   ├── grid.ts
                                           │   │   └── ui.ts
                                           │   └── types/
                                           │       └── primitives.ts
                                           │
├── engine/                                ├── engine/
│   ├── ecs/                               │   ├── ecs/
│   ├── components/                        │   ├── components/
│   ├── commands/                          │   ├── commands/
│   │   ├── EngineCommands.ts              │   │   ├── EngineCommands.ts
│   │   ├── dispatcher.ts  (786 LOC)       │   │   ├── dispatcher.ts          (~120 LOC, router only)
│   │   ├── history.ts                     │   │   ├── history.ts
│   │   └── wallTopology.ts                │   │   └── handlers/               ← MỚI
│   │                                      │   │       ├── wallHandlers.ts
│   │                                      │   │       ├── furnitureHandlers.ts
│   │                                      │   │       ├── selectionHandlers.ts
│   │                                      │   │       ├── sceneHandlers.ts
│   │                                      │   │       └── wallTopology.ts
│   ├── systems/                           │   ├── systems/
│   │   ├── WallGeometrySystem.ts (443)    │   │   ├── WallGeometrySystem.ts  (~180)
│   │   │                                  │   │   ├── wallMeshBuilder.ts     ← MỚI
│   │   │                                  │   │   ├── wallCornerJoiner.ts    ← MỚI
│   │   ├── CannonCollisionSystem.ts (425) │   │   ├── CannonCollisionSystem.ts (~180)
│   │   │                                  │   │   ├── cannonBodyFactory.ts   ← MỚI
│   │   ├── GizmoSystem.ts (338)           │   │   ├── GizmoSystem.ts         (~180)
│   │   │                                  │   │   ├── gizmoHandles.ts        ← MỚI
│   │   └── ... (other systems)            │   │   └── ... (other systems)
│   ├── game/                              │   ├── game/
│   │   ├── FurnitureFactory.ts            │   │   ├── FurnitureFactory.ts
│   │   └── FurnitureCatalog.ts            │   │   ├── FurnitureCatalog.ts
│   │                                      │   │   └── getFootprint.ts        ← MỚI (gộp 3 chỗ)
│   │                                      │   ├── placement/                 ← MỚI
│   │                                      │   │   ├── validatePlacement.ts   (gộp 2 collision)
│   │                                      │   │   └── snapToGrid.ts
│   │                                      │   ├── registries/                ← MỚI
│   │                                      │   │   ├── MeshRegistry.ts
│   │                                      │   │   ├── ModelRegistry.ts
│   │                                      │   │   └── EntityRegistry.ts      (cleanup orchestrator)
│   ├── graph/                             │   ├── graph/
│   ├── events/                            │   ├── events/
│   ├── serialization/                     │   ├── serialization/
│   ├── setup/                             │   ├── setup/
│   ├── rendering/                         │   ├── rendering/
│   ├── utils/                             │   │
│   │   ├── coords.ts          ──────────► │   (đã move sang shared/math/)
│   │   └── wallHelpers.ts                 │   (move vào commands/handlers/)
│   ├── engine.ts                          │   ├── engine.ts
│   └── engineTypes.ts                     │   └── engineTypes.ts
│
├── app/                                   ├── app/
│   ├── pages/                             │   ├── pages/
│   ├── components/                        │   ├── components/
│   │   └── editor/                        │   │   ├── common/                 ← MỚI
│   │       ├── Canvas.tsx                 │   │   └── editor/
│   │       ├── SceneView3D.tsx            │   │       ├── Canvas.tsx
│   │       ├── PlanView2D.tsx  (647 LOC)  │   │       ├── SceneView3D.tsx
│   │       ├── DecorCatalog.tsx (507)     │   │       ├── BottomNavBar.tsx
│   │       ├── BottomNavBar.tsx           │   │       ├── TopNavBar.tsx
│   │       ├── TopNavBar.tsx              │   │       ├── PlanView2D/         ← FOLDER thay file
│   │       ├── BuildPanel.tsx             │   │       │   ├── index.tsx        (~120 LOC)
│   │       ├── WallPropertiesPanel.tsx    │   │       │   ├── RoomLayer.tsx
│   │       ├── LoadingScreen.tsx          │   │       │   ├── WallLayer.tsx
│   │       ├── PlacementHint.tsx          │   │       │   ├── FurnitureLayer.tsx
│   │       ├── ShortcutHint.tsx           │   │       │   ├── HandleLayer.tsx
│   │       ├── furnitureImages.ts         │   │       │   ├── DimensionLayer.tsx
│   │       ├── furnitureSprite.tsx        │   │       │   ├── OverlayLayer.tsx
│   │       │                              │   │       │   ├── usePlanCamera.ts
│   │       │                              │   │       │   └── usePlanInput.ts
│   │       │                              │   │       ├── DecorCatalog/       ← FOLDER thay file
│   │       │                              │   │       │   ├── index.tsx
│   │       │                              │   │       │   ├── CategoryTabs.tsx
│   │       │                              │   │       │   ├── CatalogGrid.tsx
│   │       │                              │   │       │   ├── CatalogItem.tsx
│   │       │                              │   │       │   ├── catalogData.ts
│   │       │                              │   │       │   └── sprite.ts       (gộp furnitureImages+Sprite)
│   │       │                              │   │       ├── projection2d/       ← MỚI
│   │       │                              │   │       │   ├── wallToPolygon.ts
│   │       │                              │   │       │   └── furnitureToSprite.ts
│   │       └── tools/                     │   │       └── tools/
│   │           ├── ToolBase.ts            │   │           ├── ToolBase.ts
│   │           ├── DrawWallTool.tsx       │   │           ├── toolRegistry.ts  ← MỚI
│   │           ├── SelectTool.tsx         │   │           ├── DrawWallTool.tsx
│   │           ├── PlaceFurnitureTool.tsx │   │           ├── SelectTool.tsx
│   │           ├── collision2D.ts ──────► │   │           ├── PlaceFurnitureTool.tsx
│   │           └── toolUtils.ts           │   │           └── toolUtils.ts
│   │                                      │   │             (collision2D → engine/placement/)
│   ├── store/                             │   ├── store/
│   │   ├── useUIStore.ts                  │   │   ├── useUIStore.ts
│   │   └── useFloorPlanStore.ts (265) ──► │   │   └── useFloorPlanSnapshot.ts (renamed)
│   ├── hooks/                             │   ├── hooks/
│   │   ├── useEngineDispatch.ts ────────► │   │   (DELETED — inline engine.api.dispatch)
│   │   └── usePlanShortcuts.ts            │   │   └── usePlanShortcuts.ts
│   └── engine/                            │   └── engine/
│       └── EngineContext.tsx              │       └── EngineContext.tsx
│                                          │
                                           └── docs/                       ← MỚI (fix README 404)
                                               ├── architecture.md
                                               └── command-flow.md
```

---

## Hiệu ứng kỳ vọng

| Metric | Before | After |
|---|---|---|
| File > 300 LOC | 8 file | 0 file (trừ data) |
| Switch case duplicate khi add tool | 5–6 chỗ | 1 chỗ (registry) |
| Snap/rotation constant duplicate | 4 chỗ | 1 chỗ |
| Footprint resolution duplicate | 3 chỗ | 1 chỗ |
| Collision impl | 2 (drift risk) | 1 (single source) |
| Shadow registry GC trong dispatcher | 3 lines × N handlers | 1 line (`EntityRegistry.disposeEntity`) |
| `dispatcher.ts` LOC | 786 | ~120 |
| `PlanView2D.tsx` LOC | 647 | ~120 (index) + 7 file <150 |
| Onboarding entry-point | README 404 | `docs/architecture.md` + `docs/command-flow.md` |
| **Tổng effort** | — | **~50h / 6–7 ngày** |

---

## Ràng buộc & lưu ý

- **Không rewrite engine.** Giữ nguyên ECS + Command + Snapshot + Tool pattern. Chỉ tổ chức lại file/folder.
- **Không thêm tooling mới.** Giữ Vite + pnpm hiện tại. Không Nx, không Turborepo.
- **Thứ tự sequencing là bắt buộc:** Đợt 1 và 2 phải xong trước Đợt 3 (handler cần constants + `EntityRegistry` + `validatePlacement`). Đợt 5 phải xong trước Đợt 6 (sub-component dùng `toolRegistry`, không phải union type cứng).
- **Mỗi đợt commit riêng** với CI pass — không gộp đợt vào 1 PR khổng lồ.
- **Visual regression** ở Đợt 6: chụp screenshot before/after `PlanView2D` để bảo đảm không drift UI.

---

## Files đã reference

- `01-frontend/src/engine/commands/dispatcher.ts` (786 LOC — split target chính)
- `01-frontend/src/app/components/editor/PlanView2D.tsx` (647 LOC — split target chính)
- `01-frontend/src/app/components/editor/DecorCatalog.tsx` (507 LOC)
- `01-frontend/src/engine/systems/WallGeometrySystem.ts` (443 LOC)
- `01-frontend/src/engine/systems/CannonCollisionSystem.ts` (425 LOC)
- `01-frontend/src/engine/systems/GizmoSystem.ts` (338 LOC)
- `01-frontend/src/app/store/useFloorPlanStore.ts` (rename target)
- `01-frontend/src/engine/utils/coords.ts` (move target)
- `01-frontend/src/app/hooks/useEngineDispatch.ts` (delete target)
- `01-frontend/src/engine/commands/wallTopology.ts` (precedent pattern tham khảo — đã có `handleSplitWall`)
