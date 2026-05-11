# Implementation Plan — Fix từ Code Review

> Dựa trên: `.doc/code_review.md` | Ngày lên kế hoạch: 2026-04-29

---

## Phase 1 — Critical & High (Làm ngay, không có risk)

### Task 1.1 — Fix ID counter reset sau component remount
**File:** `src/app/pages/Plan2DPage.tsx`  
**Mức độ:** 🔴 Critical

**Vấn đề:** `_nextNodeId`, `_nextWallId` là module-level `let` — reset về `INITIAL_NEXT_NODE_ID` mỗi khi hot reload hoặc route remount. Sẽ tạo node/wall ID trùng với ID đang có trong engine.

**Kế hoạch:**
- Expose thêm `api.getNextIds(): { nodeId: number; wallId: number }` trong `engine.ts` → trả về `nodeRegistry.nextAvailableId()` và `maxWallId + 1`
- Trong `Plan2DPage`, đọc giá trị này từ `window.gameEngine.api` lúc init
- Thay `let _nextNodeId = INITIAL_NEXT_NODE_ID` bằng `useRef` được khởi tạo từ engine

**Acceptance:** Sau hot reload, vẽ wall mới không gây duplicate node ID trong console.

---

### Task 1.2 — Fix Material leak trong `updateCapMesh`
**File:** `src/engine/systems/WallGeometrySystem.ts`  
**Mức độ:** 🟠 High

**Vấn đề:** Mỗi lần `updateCapMesh` tạo cap mesh mới, `new THREE.MeshStandardMaterial()` được tạo nhưng material cũ chưa bị `.dispose()`. Sau nhiều lần edit, VRAM tăng không giảm.

**Kế hoạch:**
- Đổi `capMeshes` từ `Map<number, THREE.Mesh>` thành `Map<number, { mesh: THREE.Mesh; mat: THREE.Material }>`
- Khi `existing` tìm thấy: dispose `existing.mat` trước khi gán material mới
- Khi remove: dispose cả `mesh.geometry` và `mat`

**Acceptance:** Dùng Chrome DevTools Memory snapshot — sau 20 lần sửa tường, số Material objects không tăng.

---

### Task 1.3 — Xóa orphan node 5 trong default room
**File:** `src/engine/engine.ts`  
**Mức độ:** 🟠 High

**Vấn đề:** `DEFAULT_NODE_DEFS` có `{ id: 5, x: 6, z: -5 }` trùng tọa độ với node 1. Không wall nào dùng node 5 → orphan ngay từ đầu. UI hiện `5 nodes · 3 walls` thay vì `4 nodes · 3 walls`.

**Kế hoạch:**
- Xóa entry node 5 khỏi `DEFAULT_NODE_DEFS`
- Kiểm tra lại `DEFAULT_WALL_DEFS` — node 6 và 7 dùng cho `wallId: 3` (back wall), đảm bảo không bị ảnh hưởng

**Acceptance:** Info bar hiện `4 nodes · 3 walls` khi khởi động.

---

## Phase 2 — Medium (Làm sau Phase 1)

### Task 2.1 — Đồng nhất hash precision trong SnapshotSystem
**File:** `src/engine/systems/SnapshotSystem.ts`  
**Mức độ:** 🟡 Medium

**Vấn đề:** Hash dùng 3 mức precision khác nhau:
- Nodes: `.toFixed(4)`
- Wall centers: `.toFixed(3)`
- Cap points: `.toFixed(2)`

Cap point chỉ có precision 0.01 → có thể miss thay đổi nhỏ trong miter (geometry cập nhật nhưng snapshot không emit).

**Kế hoạch:**
- Đồng nhất tất cả về `.toFixed(3)` (1mm accuracy ở scale hiện tại)

**Acceptance:** Build pass, không có regression trong snapshot emit frequency.

---

### Task 2.2 — Fix HEIGHT hardcode trong cap mesh
**File:** `src/engine/systems/WallGeometrySystem.ts`  
**Mức độ:** 🟡 Medium

**Vấn đề:** `const HEIGHT = 1` trong `updateCapMesh` — cap luôn cao 1 unit bất kể wall thickness hay height.

**Kế hoạch:**
- Thêm param `height: number` vào `updateCapMesh(nodeId, capPolygon, height)`
- Tại callsite trong `update()`, lấy height từ `WallSize` của bất kỳ connected wall nào:
  ```ts
  const anyWallEnt = wallEntityByNodeId.get(nodeId)?.[0];
  const h = anyWallEnt ? world.getComponent(anyWallEnt, WallSize)?.height ?? 1 : 1;
  ```
- Lưu ý: WallGeometrySystem không có access trực tiếp `wallEntityByWallId` — cần đọc từ `Query` + `WallNodes`

**Acceptance:** Nếu wall height = 2, cap mesh cũng cao 2 units trong 3D view.

---

### Task 2.3 — Fix early return bỏ qua cap mesh cleanup
**File:** `src/engine/systems/WallGeometrySystem.ts`  
**Mức độ:** 🟡 Medium

**Vấn đề:** Dòng `if (wallEntities.length === 0) return;` thoát sớm — khi tất cả walls bị xóa, `capMeshes` không được clear.

**Kế hoạch:**
- Di chuyển `capMeshes` cleanup lên trước early return, hoặc
- Thay early return bằng skip các bước sau mà vẫn chạy cleanup

**Acceptance:** Xóa tất cả walls → không còn cap mesh nào trong 3D scene.

---

### Task 2.4 — Visual snap indicator trong draw mode
**File:** `src/app/pages/Plan2DPage.tsx`  
**Mức độ:** 🟡 Medium

**Vấn đề:** Khi cursor gần node trong draw mode, không có feedback visual nào. User không biết mình đang snap.

**Kế hoạch:**
- Thêm state `snapPreviewNodeId: number | null`
- Trong `onMouseMove`, nếu `snappedNodeId !== null` → set `snapPreviewNodeId`
- Trong Layer 5 (node dots), render Circle có ring highlight màu `#38bdf8` với `strokeWidth={3}` cho node đang snap

**Acceptance:** Trong draw mode, khi cursor cách node < 20px, node đó sáng lên màu xanh.

---

### Task 2.5 — Fix GizmoSystem emit `entitySelected: null` mỗi frame
**File:** `src/engine/systems/GizmoSystem.ts`  
**Mức độ:** 🟢 Low

**Vấn đề:** `onMouseDown` trên empty space: gọi `controls.detach()` và emit `entitySelected: null` kể cả khi đã detached từ frame trước.

**Kế hoạch:**
- Thêm `private currentEntity: number | null = null`
- Chỉ emit và detach nếu `currentEntity !== null`
- Reset về `null` khi detach

**Acceptance:** Console.log confirm emit chỉ xảy ra một lần khi click vào empty space.

---

### Task 2.6 — Fix dispatch silent fail
**File:** `src/app/pages/Plan2DPage.tsx`  
**Mức độ:** 🟢 Low

**Vấn đề:** Module-level `function dispatch()` gọi `window.gameEngine?.api.dispatch(cmd)` — nếu engine null, command bị drop không cảnh báo.

**Kế hoạch:**
- Thêm warning: `if (!window.gameEngine) { console.warn('[Plan2D] dispatch called before engine init:', cmd); return; }`

**Acceptance:** Nếu vô tình dispatch trước engine init, console hiện warning rõ ràng.

---

### Task 2.7 — Fix `_recomputeWallAABB` duplicate logic
**File:** `src/engine/engine.ts`  
**Mức độ:** 🟡 Medium

**Vấn đề:** `_recomputeWallAABB` và `WallGeometrySystem` đều set `Transform`, `WallSize`, `ColliderAABB`. Logic trùng lặp, khó maintain.

**Kế hoạch:**
- Giữ `_recomputeWallAABB` chỉ cho AABB + ColliderAABB (physics sync)
- Bỏ việc set `Transform.rotY` trong `_recomputeWallAABB` vì `WallGeometrySystem` sẽ override ngay frame sau
- Thêm comment rõ: `// Sync AABB for Cannon — geometry will be rebuilt by WallGeometrySystem next frame`

**Acceptance:** Build pass, không có behavior regression.

---

## Phase 3 — Feature (Tuần tiếp theo)

### Task 3.1 — Serialization: Save / Load floor plan
**Files:** `engine.ts`, `NodeRegistry.ts`, new `useFloorPlanSerializer.ts`

**Kế hoạch:**
- `NodeRegistry.snapshot()` đã có → serialize nodes
- Thêm `wallEntityByWallId` snapshot trong engine API
- `useFloorPlanSerializer.ts`: `save()` → JSON blob, `load(json)` → dispatch `ENSURE_NODE` + `ADD_WALL` sequence

---

### Task 3.2 — Visual snap indicator (đầy đủ)
> Xem Task 2.4 — phiên bản cơ bản. Mở rộng thêm:
- Hiện distance label khi snap (px còn lại)
- Snap line preview từ cursor đến node

---

### Task 3.3 — Room detection
**Files:** new `RoomDetector.ts`, `SnapshotSystem.ts`

**Kế hoạch:**
- Dùng graph từ `NodeRegistry` để tìm closed cycles (BFS/DFS)
- Emit `rooms: RoomSnapshot[]` trong ECS snapshot
- Render room fills với màu nhạt trong Layer 1.5

---

## Thứ tự thực hiện

```
Phase 1:   1.3 → 1.2 → 1.1        (3 tasks, ~2 giờ)
Phase 2:   2.1 → 2.3 → 2.2 → 2.4 → 2.6 → 2.5 → 2.7   (~4 giờ)
Phase 3:   3.1 → 3.2 → 3.3        (features, nhiều ngày)
```

> **Lưu ý:** Mỗi task kết thúc phải chạy `npm run build` và confirm 0 errors trước khi sang task tiếp.
