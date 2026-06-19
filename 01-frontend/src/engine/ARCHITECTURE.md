# Kiến trúc engine HomeVerse (`src/engine/`)

Tài liệu bản đồ 1 trang cho tầng engine: cách khởi động, thứ tự chạy system, luồng
dữ liệu command, và vai trò từng thư mục. Mục tiêu: đọc file này là hiểu được "cái gì
gọi cái gì" trước khi mở source.

Engine là TypeScript + three.js, kiến trúc **ECS** (Entity-Component-System) + **Command
Pattern**. Không phụ thuộc React — tầng app giao tiếp qua `EngineApi` + event bus.

---

## 1. Khởi động (boot sequence)

Điểm vào DUY NHẤT là `createEngine(canvas)` trong [`engine.ts`](./engine.ts). Thứ tự lắp ráp:

1. **Three.js** scene / camera / renderer — `setup/sceneSetup.ts`
2. **ECS World** + `NodeRegistry` (đồ thị node tường) + `EngineEvents` (event bus)
3. **Systems** đăng ký vào World theo đúng thứ tự chạy — `setup/systemSetup.ts`
4. Đèn ambient + directional mặc định — `factories/LightFactory.ts`
5. **Dispatcher** + `UndoHistory` + `asyncTransactionFn` — `commands/`
6. **FurniturePlacementSystem** (nhận `asyncTransaction` + `dispatchAsync`)
7. **Game loop** bắt đầu (`requestAnimationFrame` → `world.update()` mỗi frame)

`EngineInstance` trả về được mount vào `window.gameEngine` (chỉ DEV) và
`EngineContext.Provider` (React tree).

> Phím tắt toàn cục KHÔNG ở engine — React (`useEditorShortcuts`) xử lý.

---

## 2. Thứ tự chạy System (mỗi frame)

`World.update()` chạy các system **theo đúng thứ tự đăng ký** trong `systemSetup.ts`.
Thứ tự quan trọng: system sau đọc kết quả system trước trong cùng frame.

```
OrbitControl → Gizmo → Collision → Light →
WallGeometry → WallMount → WallOpening → Room → Dimension → Render → Snapshot
                                                          (+ CollisionDebug ở DEV)
```

Điểm mấu chốt:
- **WallGeometry** (dựng mesh tường) chạy TRƯỚC WallMount/WallOpening/Dimension/Snapshot
  (chúng đọc hình tường đã dựng).
- **WallMount/WallOpening** sau WallGeometry: item bám tường & lỗ CSG cần `WallPolygon` đã có.
- **Render** dựng khung hình; **Snapshot** chạy CUỐI để emit trạng thái hoàn chỉnh cho UI.
- Snap/align nội thất KHÔNG còn là System — đã gộp vào `shared/geometry/alignment`, gọi
  trực tiếp từ các đường nhập 2D/3D.

---

## 3. Luồng dữ liệu Command (mutation)

Mọi thay đổi cấu trúc floor plan (tường, node) và lifecycle (furniture spawn/dispose)
PHẢI đi qua dispatcher — không ngoại lệ. `commands/dispatcher.ts` là **router mỏng**:
mỗi command delegate sang một handler trong `commands/handlers/*Handlers.ts`.

```
[UI] vẽ tường / kéo node / đặt furniture
   ▼
dispatch(command: EngineCommand)        // switch theo command.type
   ▼
[Handler] mutation component trong World + cập nhật NodeRegistry / Registries
   ▼  (chỉ INVALIDATE: remove WallPolygon, KHÔNG rebuild ngay)
[WallGeometrySystem] frame kế: batch rebuild mesh cho entity thiếu WallPolygon
   ▼
[SnapshotSystem] emit event "snapshot"
   ▼
[React] subscribe "snapshot" → re-render PlanView2D
```

Vì sao invalidate thay vì rebuild ngay? Drag `MOVE_NODE` liên tục → batch rebuild
1 lần/frame thay vì N lần/dispatch.

**Undo/redo**: `commands/history.ts` (`UndoHistory`) giữ snapshot scene; transaction
bọc một nhóm mutation thành 1 bước undo. Đường async (vd. PLACE_FURNITURE phải await
nạp GLB) dùng `asyncTransaction`: chụp snapshot TRƯỚC → await → push history.

---

## 4. Vai trò từng thư mục

| Thư mục | Vai trò |
|---|---|
| `ecs/` | Lõi ECS: `World`, `Component`, `System`, `Query` (sparse storage, query theo pivot nhỏ nhất). **Ổn định — không sửa.** |
| `components/` | Data thuần, 1 class/file, không logic. Nhóm theo `core/`, `physics/`, `render/`, `wall/`, `furniture/`, `interaction/`. |
| `systems/` | Logic chạy mỗi frame / theo sự kiện. Nhóm theo miền: `gizmo/`, `placement/`, `wall/`, `collision/`, `scene/`, `annotation/`, `sync/`. |
| `commands/` | Command Pattern: `dispatcher.ts` (router) + `handlers/*` + `dispatcherDeps.ts` (deps-bag, tránh global) + `history.ts` (undo). **Phần sạch nhất engine.** |
| `events/` | `EngineEvents` — event bus có kiểu (typed). Engine → UI một chiều qua đây. |
| `graph/` | `NodeRegistry` — đồ thị node/đỉnh tường (topology floor plan). |
| `registries/` | Mọi `*Registry` ở một chỗ: `EntityRegistry`, `MeshRegistry`, `MaterialRegistry`, `ModelRegistry`. |
| `rendering/` | Cầu nối three.js: `MaterialLibrary`, `GLTFModelLoader`, ghost/guide, `SelectionHighlight`, `RenderScheduler` (on-demand render), surface material. |
| `factories/` | **Entity factories**: `FurnitureFactory`, `WallFactory`, `GroundFactory`, `LightFactory` (compose component lên entity mới). |
| `catalog/` | Metadata asset: `FurnitureCatalog`, footprint, wall-item dims (kích thước/ràng buộc đặt). |
| `adapters/` | Chuyển ECS World → struct hình học thuần (DTO): `wallSegments`, `furnitureBoxes`, `wallRefs`. |
| `serialization/` | `serialize`/`deserialize` ↔ `SceneDocument` (lưu/tải + snapshot undo). |
| `setup/` | Lắp ráp khởi động: `sceneSetup`, `systemSetup`, `postprocessSetup`. Dài tuyến tính là chủ ý. |
| `utils/` | Helper (hiện đa phần liên quan tường: `wallHelpers`, `wallItemRanges`, `wallOccupancy`). |

---

## 5. Quy ước seam (engine ↔ app ↔ ai)

Ranh giới giữa các tầng — đọc trước khi thêm import xuyên tầng.

**Chiều phụ thuộc (một chiều, cấm vòng):**
```
shared  ◄── engine  ◄── ai  ◄── app  ──►  data
```
- `engine` không biết ai/app/react. `ai` chỉ biết `engine` + `shared` (**CẤM `ai → app`**).
- `app` biết tất cả; `data` chỉ biết `shared`.

**`EngineApi` vs `EngineApiFacade`** (cả hai ở [`engineTypes.ts`](./engineTypes.ts) — một nguồn duy nhất):
- `EngineApi` — bề mặt ĐẦY ĐỦ trên `engine.api` (events, camera, undo, material read…). Engine cấp.
- `EngineApiFacade` — facade NULL-SAFE, subset tiện dụng mà **UI (React) + AI tools** tiêu thụ.
  Hiện thực: `app/hooks/useEngineApi()`; mock trong test/AI. Đặt ở engine layer để `ai`
  import được mà KHÔNG tạo vòng `ai → app`. Khác `EngineApi` ở: null-safe + `withTransaction`
  (gói `transaction`) + `nextNodeId`/`nextWallId` (tách `getNextIds`).

**Toạ độ (ở [`shared/types/primitives.ts`](../shared/types/primitives.ts) — nguồn duy nhất):**
- `Vec2 = {x, y}` — điểm MÀN HÌNH / Konva (2D).
- `Vec2XZ = {x, z}` / `BBoxXZ` — điểm/hộp trên mặt SÀN (toạ độ thế giới XZ). Đừng tự khai lại.

## 6. Ba biểu diễn scene (đừng nhầm lẫn)

Cùng một floor plan tồn tại dưới 3 hình thức, mỗi cái cho một mục đích khác nhau:

| Biểu diễn | Định nghĩa | Mục đích | Nguồn / đường đi |
|---|---|---|---|
| **`SceneDocument`** | [`serialization/SceneDocument.ts`](./serialization/SceneDocument.ts) | LƯU/TẢI (persist) + snapshot undo | `serialize(world)` ↔ `deserialize()`; furniture/wallItem chỉ có toạ độ + modelId, **không entityId** |
| **`ECSSnapshot`** | [`events/EngineEvents.ts`](./events/EngineEvents.ts) | RENDER 2D — payload event `"snapshot"` | `SnapshotSystem` emit mỗi mutation → React `useFloorPlanSnapshot` → `PlanView2D` |
| **`SceneSummary`** | [`ai/perception/describeScene.ts`](../ai/perception/describeScene.ts) | AI đọc (LLM) — gọn, ổn định | `describeScene(world,nodes)`; CÓ `entityId` (để AI tham chiếu món cụ thể mà không bịa id) |

Quy tắc: persist dùng `SceneDocument`, vẽ 2D dùng `ECSSnapshot`, mô tả cho AI dùng
`SceneSummary`. Không tái dùng chéo (vd. đừng cho AI đọc `SceneDocument` — thiếu entityId).

## 7. Ghi chú & quy ước

- **Comment tiếng Việt** là quy ước của codebase — giữ nguyên khi di chuyển code.
- Quy ước đặt tên: method `private` KHÔNG có tiền tố `_`; chỉ field cache/temp mới dùng
  `_` (vd. `_tmpWorldPos`, module-level `_evaluator`).
- **On-demand render (CR-03)**: không vẽ mỗi frame vô điều kiện. Thay đổi không bump
  revision (hover gizmo, ghost bám con trỏ) phải gọi `RenderScheduler.requestRender()`.
- `window.gameEngine` chỉ tồn tại ở DEV (tree-shake ở prod) — đừng phụ thuộc ở code thật.
- Preview CSG cửa/cửa sổ (`WallOpeningPreview`) dùng qua `WallOpeningPreviewController`
  (gom logic begin-vs-update; GizmoSystem & FurniturePlacementSystem dùng chung).
