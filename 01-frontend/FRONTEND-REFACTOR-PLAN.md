# FRONTEND REFACTOR PLAN — 3D-HomeVerse

> Tổng hợp từ 2 review độc lập: **architect-reviewer** (kiến trúc macro) + **code-reviewer** (code smell vi mô).
> Phạm vi: `01-frontend/src` (~26K LOC, React + TS + Three.js/Cannon + Zustand + Vite).
> Mục tiêu: gộp duplicate, cắt long-method, đồng bộ ranh giới → code ngắn gọn, dễ hiểu, thân thiện cho dev mới.
> **Nguyên tắc: KHÔNG đổi hành vi. Mỗi bước phải xanh test + verify browser trước khi sang bước sau.**

---

## 0. TL;DR — Chẩn đoán

Kiến trúc **không tệ như cảm giác**: engine có ranh giới rõ (không import ngược lên app/ai/react), mutation ECS đi qua **một đường duy nhất** (`api.dispatch(EngineCommand)`), có `ARCHITECTURE.md`. Cảm giác "khó hiểu, không đồng bộ" đến từ **các vết nứt ở seam**, không phải layering sai toàn cục:

| Nhóm gốc rễ | Triệu chứng dev nhìn thấy |
|---|---|
| **Trùng tên / khái niệm** | 2 type `EngineApi` khác shape; `Vec2` (x,y) vs (x,z); 3 "scene model" |
| **Đảo chiều layer** | `ai → app` (vòng `app → ai → app`); leak `world/nodes` cho UI & AI |
| **Duplicate vi mô** | yaw↔quat lặp 9+ chỗ; `wo?:wm` rải toàn codebase; logic kéo wall-item fork 3 bản; màu brand hardcode 117 lần |
| **God-file / long-method** | `GizmoSystem` 615, `useFurnitureDrag` 440, `MaterialSidebar` 459, `ProjectsPage` 450 |

**Engine core (commands/dispatcher) là phần khoẻ nhất — KHÔNG đụng.**

---

## 1. Kiến trúc mục tiêu

### 1.1 Chiều phụ thuộc (một chiều, cấm vòng)
```
shared  ◄── engine  ◄── ai  ◄── app  ──►  data
```
- `engine` không biết ai/app/react (đang đúng — giữ).
- `ai` chỉ biết `engine` + `shared`. **CẤM `ai → app`.**
- `app` biết tất cả; `data` chỉ biết `shared`.

### 1.2 Convention chốt (ghi vào `ARCHITECTURE.md`)
- **Một `EngineApi` duy nhất** ở `engine/engineTypes.ts`. Mọi nơi import từ đó.
- **`shared/types` là nguồn duy nhất** của primitives (`Vec2`, `BBox`). Trục XZ đặt tên riêng (`Vec2XZ`/`PlanPoint`).
- **Data-access chỉ gọi từ hook** (`use*`). Component không import `data/` trực tiếp.
- `useXxx` chỉ đặt cho React hook thật; adapter thuần để hàm thường.
- Màu brand chỉ qua token (`designTokens.ts` / CSS var), không hardcode hex/rgba trong JSX.

---

## 2. LỘ TRÌNH THEO PHASE

Sắp xếp theo **rủi ro tăng dần**. Phase 1–2 là quick-win thuần (util/toán/tên) — gần như zero-risk. Phase 3–4 đụng seam kiến trúc. Phase 5 đụng vùng phức tạp (gizmo/drag) — bắt buộc có test regression trước.

---

### PHASE 1 — Quick wins thuần (util/toán/string) · rủi ro: RẤT THẤP

> **STATUS (2026-06-19):** PHẦN LỚN ✅. 1.1 (`shared/math/yaw.ts`), 1.2 (`shared/dom/isTypingTarget.ts`),
> 1.5 (`withRoomFloorMesh`) đã commit (c6b11ed). 1.3 (`apiErrorMessage`) ✅ — helper + 4 call-site
> (ProjectsPage/VersionsPanel/CreateProjectModal/ProfileModal) qua công việc FE-BE. 1.4 RELEASE_FRAMES ✅.

Không đổi luồng, chỉ rút helper và thay call-site 1-1.

**1.1 `shared/math/yaw.ts`** — gộp công thức yaw↔quaternion
- Gốc đã có sẵn: `engine/components/core/Transform.ts:41`.
- Lặp tại: `gizmoHandles.ts:210,301`, `GizmoSystem.ts:487`, `WallMountSystem.ts:95`, `WallItemGhost.ts:132`, `FurnitureFactory.ts:162,254`, `furnitureHandlers.ts:219-222`.
- Chiều ngược `2*atan2(q.y,q.w)`: `furnitureHandlers.ts:167`, `gizmoHandles.ts:462`, `GizmoSystem.ts:267`, `gizmoHandles.ts:378-381`.
- API: `yawToQuat(yaw)`, `quatToYaw(qx,qy,qz,qw)`, `setYawQuaternion(obj, yaw)`. → có unit test.

**1.2 `shared/dom/isTypingTarget.ts`** — xoá 3 bản sao
- `GizmoSystem.ts:71-75` (engine — có thể giữ độc lập), `useEditorShortcuts.ts:43-47`, `usePlanShortcuts.ts:140` → 2 hook app dùng chung.

**1.3 `data/api/client.ts` → `apiErrorMessage(err, fallback)`** (hoặc `runWithToast`)
- Xoá pattern `err instanceof ApiError ? err.message : "..."` + toast lặp 8 lần: `ProjectsPage.tsx:168,193,209,224,242`, `VersionsPanel.tsx:85,102`, `CreateProjectModal.tsx:99`.

**1.4 Đặt tên cho magic numbers**
- `RELEASE_FRAMES=2` (`GizmoSystem.ts:305`), loader `2500`/`40`/`45+55` (`EditorPage.tsx:217,94,155`).

**1.5 `withRoomFloorMesh(roomKey, deps, fn)`** — gộp SET/RESET floor material
- `surfaceHandlers.ts:74-91` và `108-123` chia sẻ khối tìm RoomGeometry → meshRegistry → swap.

✅ **Done khi:** test xanh, không còn call-site lặp ở các điểm trên.

---

### PHASE 2 — Token hoá & dọn JSX · rủi ro: THẤP

> **STATUS (2026-06-19):** ⛔ **CHƯA LÀM.** Không có commit nào đụng tới. Đây là phần quick-win
> (rủi ro thấp) duy nhất còn bỏ ngỏ — nên ưu tiên làm tiếp vì dọn được nhiều "ồn" nhất cho dev mới
> (117 hex màu brand rải 39 file). Thứ tự đề xuất: 2.1 token màu → 2.3 helper `tagObject/readEntity`
> → 2.2 tách inline-style → 2.4 dead code.

**2.1 Token màu brand** — `#f8b400`/`rgba(248,180,0)`/`rgba(124,88,0)` lặp **117 lần / 39 file**.
- Đã có `designTokens.ts` (`T.*`) nhưng JSX phần lớn không dùng. Bắt đầu từ `EditorPage`, `MaterialSidebar` (10 chỗ), `AIChatbot` (11 chỗ).

**2.2 Tách inline-style khổng lồ thành component/CSS**
- `<MaterialHintToast>` ← `EditorPage.tsx:241-274`.
- `MaterialSidebar ResetButton:36-57` đang set `btn.style` imperative trong React → CSS class.

**2.3 `tagObject(obj, entityId)` / `readEntity(obj)`** — bọc cast `__entity/__wallId/__roomKey`
- Thay ~12 cast rải `gizmoHandles.ts`, `GizmoSystem.ts:222,318,382,496`.

**2.4 Dead code**
- `GizmoSystem.ts:172 void SNAP_M`, comment "Multiselect TƯƠNG LAI" `gizmoHandles.ts:425-431`.

✅ **Done khi:** không còn hex/rgba brand trong JSX các file đã xử lý; cast `__entity` đi qua helper.

---

### PHASE 3 — Dọn seam kiến trúc (trùng tên / đảo chiều) · rủi ro: TRUNG

> **STATUS (2026-06-19):** 3.1 ✅ (tách `EngineApiFacade` sang `engineTypes.ts`, bỏ va tên
> với `EngineApi` đầy đủ — KHÔNG đổi tên method `withTransaction`/`nextNodeId` để giữ hành vi),
> 3.2 ✅ (`ai → app` đã cắt sạch — 7 file ai import `EngineApiFacade` từ engine), 3.4 ✅
> (`Vec2XZ`/`BBoxXZ` về `shared/types`, describeScene hết tự khai), 3.5 ✅ (ARCHITECTURE.md §5–6).
> **3.3 HOÃN** (đóng kín `EngineInstance` + `readSceneGraph()` đổi contract perception AI + harness
> test — cần thiết kế cẩn thận, không phải refactor cơ học). Typecheck + 168/168 test xanh.

Đây là **gốc của cảm giác "không đồng bộ"**. Làm tuần tự, mỗi PR một mục.

**3.1 Hợp nhất 2 `EngineApi` thành 1** ⭐
- Xoá type khai báo lại trong `app/hooks/useEngineApi.ts:24`; import từ `engineTypes.ts:39`.
- Đồng bộ tên method (chọn 1 bộ): `transaction` (không `withTransaction`), `getNextIds` (không `nextNodeId/nextWallId`).

**3.2 Cắt `ai → app`** ⭐
- `ai/tools/dispatchBridge.ts:14`, `ai/agent/agentTypes.ts:12`, `ai/agent/createAgentRunner.ts:7`, `ai/test/engineHarness.ts:19` → import `EngineApi` từ `engine`, không từ `app`. Xoá vòng `app → ai → app`.

**3.3 Đóng kín `EngineInstance` — bỏ leak `world/nodes`** ⭐
- `engineTypes.ts:142` đang phơi `world/nodes/wallEntityByWallId/floorMaterials`.
- Thêm read-method lên `EngineApi`: `readSceneGraph()`, `getWallEntityId(wallId)`.
- `AIChatbot.tsx:74-76` chỉ truyền `api`, không truyền `world`.
- `ai/perception/describeScene.ts:17-26` đọc qua `EngineApi.readSceneGraph()` thay vì Query ECS thô.

**3.4 Dọn `Vec2`/`BBox` trùng-xung-đột** ⭐
- `describeScene.ts:30-31` tự định nghĩa `Vec2={x,z}` + `BBox` — xung đột `shared/types/primitives.ts:10` (`Vec2={x,y}`).
- Chuyển về `shared/types`; trục XZ đặt tên rõ `Vec2XZ`/`PlanPoint`.

**3.5 Tài liệu hoá "3 scene representations"**
- Bảng trong `ARCHITECTURE.md` map: `SceneDocument` (persist) ↔ `ECSSnapshot` (render 2D) ↔ `SceneSummary` (AI).

✅ **Done khi:** chỉ còn 1 `EngineApi`; `rg "from .*app" src/ai` rỗng; UI/AI không còn chạm `world` trực tiếp; `Vec2` chỉ định nghĩa ở `shared`.

---

### PHASE 4 — Đồng bộ state & vị trí code · rủi ro: TRUNG

> **STATUS (2026-06-19):** ✅ **XONG TOÀN BỘ.** 4.1 ✅ (`store/useSelectionStore.ts` — tách
> selection R6 single-owner + 2 multi-select set khỏi `useUIStore`; gọi chéo một chiều
> selection→UI để đóng Material Sidebar). 4.2 ✅ (`app/engine/`→`app/engineBinding/`; `app/services/`
> rỗng đã xoá; **gộp Plan2D**: `app/plan2d/` + `views/PlanView2D/` → `app/features/plan2d/` với
> `layers/` + `hooks/`, 16 file move qua `git mv`, import nội bộ chuẩn hoá sang absolute path mới).
> 4.3 ✅ (data-access chỉ qua hook: ProjectsPage→`useProjectList`, CreateProjectModal→`useCreateProject`,
> VersionsPanel→`useVersions`). 4.4 ✅ (`hooks/useEngineEvent.ts` — ref-stable subscription, đã wire
> vào `EditorPage` + `useEngineSelectionSync`). Typecheck sạch + 168/168 test xanh. Chờ verify browser
> (thao tác Plan 2D: pan/zoom/draw/select/drag furniture + wall-item) vì là pure-move.

**4.1 Tách `useSelectionStore` khỏi `useUIStore`**
- `useUIStore.ts:111-161` trộn panel/tool/viewport **và** selection model với invariant mutual-exclusion phức tạp. Tách selection (`selected`, `selectedWallIds`, `selectedFurnitureIds`, reconcile) ra store riêng.

**4.2 Chuẩn hoá vị trí code**
- Đổi `src/app/engine/` → `src/app/engineBinding/` (rõ là React-binding, không phải "engine thứ hai").
- Gộp Plan2D rải rác (`app/plan2d/` + `views/PlanView2D/`) về `app/features/plan2d/`.
- `app/services/` đang **rỗng** → dùng nó cho data-access hoặc xoá.

**4.3 Chuẩn hoá data-access**
- Fetch chỉ trong hook (`useScenePersistence`/`useAutosave` đã đúng). Sửa các nơi fetch thẳng trong component: `ProjectsPage.tsx:21`, `CreateProjectModal.tsx:15`, `VersionsPanel.tsx`.

**4.4 `useEngineEvent(engine, name, cb)`** — gộp ~6 useEffect subscription giống nhau
- `EditorPage.tsx` có 9 useEffect (`:91,99,111,119,128,137,153,164`); `useEngineSelectionSync.ts` 3 cái cùng pattern.

✅ **Done khi:** selection nằm ở store riêng; không còn `app/engine` mơ hồ; component không import `data/` trực tiếp.

---

### PHASE 5 — Gộp duplicate lớn & chẻ god-file · rủi ro: CAO (cần test regression trước)

> **STATUS (2026-06-19):** ✅ **XONG TOÀN BỘ.** Cổng regression đã có (`2f5bdb5` golden tests cho 3 kernel
> drag) trước khi đụng. 5.1 ✅ (`0deae86` WallItemTopology accessor), 5.2 ✅ (`959f3b3` kernel
> `resolveWallItemT`+`clampWallItemT` — gộp 3 bản clamp-t về 1), 5.3 ✅ (`e841ebc` seam
> furniture-translate), 5.4 ✅ (`238387e`+`1683ef8`+`6dcf17f` — chẻ `GizmoSystem` thành GizmoPicking +
> WallItemGizmoAdapter + GizmoDragLifecycle), 5.6 ✅ (`f67025d` chẻ page/panel lớn, pure-extract).
> **5.5 ✅** (`2ccbbec` trích toán group-drag thuần + unit; nay chẻ `useFurnitureDrag` 437→261 LOC thành
> composer + 3 hook con `useWallItemDrag`/`useGroupDrag`/`useGroupRotate`, mỗi cái sở hữu state gesture
> riêng, composer giữ single-drag + showCollide/renderGuide, rẽ nhánh wall-item→group→single nguyên thứ tự).
> tsc sạch + 196/196 test xanh (golden không đổi kỳ vọng). Chờ verify browser theo checklist 5.5. **Phát hiện
> nghi vấn (giữ nguyên, KHÔNG sửa trong PR refactor):** trong group-end, `applyGroupFollow` chạy SAU khi
> `groupDragRef` đã bị null → là no-op (comment nói "gộp cử động cuối" nhưng thực tế không chạy) — ghi nhận để PR riêng.

> ⚠️ Vùng gizmo/drag là phức tạp nhất. **Viết regression test drag 2D + 3D + wall-item trước khi đụng.**

**5.1 `WallItemRef` — gộp polymorphism `WallOpening` vs `WallMounted`** ⭐⭐
- Pattern `wo ? wo.hostWallId : wm?.hostWallId` (+ `.t`, `.side`) lặp: `gizmoHandles.ts:258-260,296-297,369-371`, `GizmoSystem.ts:475-481`, `furnitureHandlers.ts:94-123`; đọc `wo!/wm!` ở `wallItemRanges.ts:30,37`, `WallMountSystem.ts:62`, `WallOpeningSystem.ts:68`, `WallOpeningPreviewController.ts:47`, `nodeHandlers.ts:74`, `wallTopology.ts:139`, `describeScene.ts:229`.
- Helper: `getWallItemTopology(world, entity): {hostWallId,t,side,kind} | null` + `setWallItemTopology(...)`. **Xoá phần lớn `!` non-null** (smell C4).

**5.2 Hợp nhất "wall-item move resolver"** ⭐⭐ — hiện fork **3 bản** clamp-t độc lập (dễ lệch hành vi)
- 3D `slideWallItem` (`gizmoHandles.ts:250-338`), command `handleMoveWallItem` (`furnitureHandlers.ts:91-125`), 2D `projectWallItem` (`useFurnitureDrag.ts:160-182`).
- Rút hàm thuần `resolveWallItemMove(input) → {hostWallId,t,side,overlapping,pose}` ở `shared/geometry/wallMount.ts`. Cả 3 nơi gọi chung.

**5.3 Hợp nhất furniture translate**
- 3D `handleFurnitureTranslate` (`gizmoHandles.ts:457-515`) và 2D `applyFurnitureDrag` (`useFurnitureDrag.ts:193-225`) cùng `resolveAlignment`+collision. Tách phần "compute target pose" thuần khỏi phần ghi Konva/Three imperative.

**5.4 Chẻ `GizmoSystem.ts` (615)**
- Tách `GizmoDragLifecycle` (`onDraggingChanged:217-307`), `GizmoPicking` (onMouseDown/contextmenu), `WallItemGizmoAdapter`.

**5.5 Chẻ `useFurnitureDrag.ts` (440)**
- Tách `useGroupDrag`, `useWallItemDrag`, single-drag; `commitGroupRotate`/`revertGroupRotate` (`onTransformEnd:377-437`).

**5.6 Chẻ page lớn**
- `ProjectsPage.tsx` (450) → `<ProjectsSidebar>` + `<ProjectGrid>` + `useProjectList()`.
- `MaterialSidebar/index.tsx` (459) → `<ObjectMaterialPanel>` / `<WallMaterialPanel>` / `<FloorMaterialPanel>`.
- `EditorPage.tsx` (309) → `useEditorLoadingProgress()` + `<MaterialHintToast>` (đã rút ở 2.2).

✅ **Done khi:** wall-item topology đi qua 1 helper; clamp-t chỉ còn 1 nguồn; mỗi god-file < ~250 LOC; drag 2D/3D regression xanh.

---

## 3. Bảng ưu tiên tổng (impact / risk)

| # | Việc | Phase | Impact | Risk |
|---|------|-------|--------|------|
| 1 | `shared/math/yaw.ts` (9+ call-site) | 1.1 | Cao | Rất thấp |
| 2 | `apiErrorMessage` (8 chỗ) | 1.3 | Trung | Rất thấp |
| 3 | `isTypingTarget` (3 bản) | 1.2 | Trung | Rất thấp |
| 4 | Token màu brand (117 lần) | 2.1 | Cao | Thấp |
| 5 | Hợp nhất `EngineApi` | 3.1 | Cao | Trung |
| 6 | Cắt `ai → app` | 3.2 | Cao | Thấp |
| 7 | Bỏ leak `world/nodes` | 3.3 | Cao | Trung |
| 8 | Dọn `Vec2`/`BBox` xung đột | 3.4 | Cao | Thấp |
| 9 | Tách `useSelectionStore` | 4.1 | Trung | Trung |
| 10 | `WallItemRef` topology helper | 5.1 | Rất cao | Trung |
| 11 | Wall-item move resolver (3→1) | 5.2 | Rất cao | Cao |
| 12 | Chẻ `GizmoSystem` / `useFurnitureDrag` | 5.4-5.5 | Trung | Cao |

---

## 4. Nguyên tắc thực thi

1. **Một mục = một PR nhỏ.** Mỗi PR: chạy `vitest` + typecheck + verify browser thao tác liên quan.
2. **Không trộn refactor với đổi hành vi.** Nếu phát hiện bug khi gộp → ghi ra, sửa ở PR riêng.
3. **Phase 5 chỉ bắt đầu sau khi có regression test** cho drag 2D/3D/wall-item (hiện thiếu).
4. **Engine command/dispatcher không đụng** — đó là phần đã refactor tốt.
5. Cập nhật `ARCHITECTURE.md` ngay khi đổi convention (1.2, 3.5).

---

## 5. Phụ lục — file trọng tâm

- `src/engine/engineTypes.ts` (`:37,39,142`) — EngineApi + leak EngineInstance
- `src/app/hooks/useEngineApi.ts` (`:24`) — EngineApi trùng tên
- `src/ai/tools/dispatchBridge.ts` (`:14`), `src/ai/agent/agentTypes.ts` (`:12`) — `ai → app`
- `src/app/components/editor/overlays/AIChatbot.tsx` (`:74-76`) — truyền world cho AI
- `src/ai/perception/describeScene.ts` (`:17-31`) — đọc ECS thô + Vec2/BBox xung đột
- `src/shared/types/primitives.ts` (`:10`) — Vec2 chuẩn
- `src/app/store/useUIStore.ts` (`:111-161`) — selection lẫn UI
- `src/engine/components/core/Transform.ts` (`:41`) — yawToQuat gốc cho 1.1
- `src/engine/systems/gizmo/GizmoSystem.ts` (615) + `gizmoHandles.ts` (515)
- `src/app/components/editor/views/PlanView2D/useFurnitureDrag.ts` (440)
- `src/engine/commands/handlers/furnitureHandlers.ts` (`:91-125`)
- `src/engine/utils/wallItemRanges.ts` + `wallOccupancy.ts` — 2 nguồn occupancy
- `src/app/pages/ProjectPage/ProjectsPage.tsx` (450), `src/app/components/editor/panels/MaterialSidebar/index.tsx` (459)

---

*Generated by architect-reviewer + code-reviewer (đối chiếu chéo). Báo cáo, không sửa code.*
