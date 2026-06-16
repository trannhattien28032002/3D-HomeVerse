# Code Review & Performance Plan — `src/app` + `src/engine`

> Reviewer: architect/code-review pass. Phạm vi: `src/app/` và `src/engine/`.
> Trạng thái codebase: chất lượng cao, đã qua nhiều đợt refactor (R1–R9, M1–M2).
> Tài liệu này gom **phát hiện** + **plan sửa từng mục** + **khảo sát chốt phương án Phase 3**.

---

## 1. Đánh giá tổng thể

Điểm mạnh đã xác nhận khi đọc code:

- **ECS sạch**: `World` là sparse map; `Query.entitiesWith` chọn component-map nhỏ nhất làm pivot (`src/engine/ecs/Query.ts:26-33`).
- **Command pattern** chuẩn: `dispatcher.ts` chỉ là router, có exhaustiveness check `never` (`dispatcher.ts:142`).
- **Revision-guard** đã áp cho `WallGeometrySystem` và `SnapshotSystem` → skip O(1) khi frame idle.
- **2D drag imperative** (Konva): chỉ dispatch lúc `onDragEnd`, gom neighbor-boxes 1 lần (`useFurnitureDrag.ts`).
- **Không lộ secret**: AI đi qua backend proxy (`VITE_API_URL`), `window.gameEngine` chỉ tồn tại trong DEV (`engine.ts:323`).

Không có lỗi nghiêm trọng hay lỗ hổng bảo mật. Các phát hiện dưới đây là **tối ưu performance còn sót** + vài chỗ tài liệu lệch hành vi thực.

---

## 2. Phát hiện

### 🟠 #1 — SnapshotSystem tạo MỚI mọi mảng collection mỗi emit → vô hiệu hóa per-collection memo (R2)

`SnapshotSystem.ts:165-173` build snapshot với `nodes/walls/caps/rooms/dimensions/furniture` đều là **mảng mới** mỗi emit. `useFloorPlanSnapshot.ts:212-216` memo từng collection theo `[snap?.walls, ox, oy]` — reference mới mỗi emit → **mọi `useMemo` recompute → React.memo của WallLayer/RoomLayer/DimensionLayer bị bust mỗi emit**.

Hệ quả: comment ở `useFloorPlanSnapshot.ts:199-201` và `WallLayer.tsx:197` khẳng định "chỉ furniture đổi thì wall không re-render" — **thực tế không đúng**. Bất kỳ snapshot re-emit nào cũng re-map + re-render cả 4 layer.

### 🟡 #2 — RenderSystem sync mesh mỗi frame, không guard

`RenderSystem.ts:40-56` mỗi frame Query toàn bộ `Transform+Mesh` rồi set position/quaternion. **Đã hạ từ 🟠 xuống 🟡 sau khảo sát** (xem §4): thực tế chỉ tường có `Mesh` component, N nhỏ. Vẫn nên guard cho nhất quán.

### 🟡 #3 — CannonCollisionSystem cấp phát + GC mỗi frame dù idle

`CannonCollisionSystem.ts:81-86`: mỗi frame 2× `Query.entitiesWith` + `.filter()` (3 mảng mới) + `gcStaticBodies`/`gcDynamicEntries`, **không có revision-guard**.

### 🟡 #4 — testOverlap quét tuyến tính toàn bộ physics bodies

`CannonCollisionSystem.ts:230-241` dùng `NaiveBroadphase` + linear scan `physicsWorld.bodies`. Khi kéo: O(steps × N) mỗi mousemove. **Hoãn** tới khi đo được scene chậm thật.

### 🟡 #5 — Query.entitiesWith cấp phát `string[]` mới mỗi gọi (đã biết — M1)

Đã ghi trong `docs/ENGINE-CODE-REVIEW.md`. Nhiều system gọi mỗi frame → GC pressure ở scene lớn.

### 🟢 #6 — Dọn dẹp nhỏ

| Việc | File | Sửa |
|------|------|-----|
| `_lastRevision` gán giữa chừng | `SnapshotSystem.ts:96` | Chuyển gán xuống cuối `update()` (gộp vào #1) |
| React key dễ trùng | `AIChatbot.tsx:48` | Dùng `useRef` counter thay `Date.now()+random()` |

---

## 3. Plan sửa từng mục

### Mục 1 — SnapshotSystem reference-stable per-collection

**Phương án**: sau khi build mảng candidate, so sánh nội dung với snapshot trước; nếu không đổi thì **reuse reference cũ** → `useMemo`/`React.memo` short-circuit.

**Files**: `src/engine/systems/sync/SnapshotSystem.ts` (1 file).

```ts
private _prev: ECSSnapshot | null = null;

function reuseIfEqual<T>(next: T[], prev: T[] | undefined, eq: (a: T, b: T) => boolean): T[] {
    if (prev && prev.length === next.length && next.every((v, i) => eq(v, prev[i]))) return prev;
    return next;
}

// cuối update(), trước emit:
const walls2 = reuseIfEqual(walls, this._prev?.walls, wallEq);
const nodes2 = reuseIfEqual(nodeSnapshots, this._prev?.nodes, nodeEq);
// ... caps, rooms, dimensions, angleDimensions, furniture
const snapshot = { nodes: nodes2, walls: walls2, /* ... */ };
this._prev = snapshot;
this.events.emit("snapshot", snapshot);
```

`*Eq` so field phẳng; nhớ đủ field (`overlapping`, `polygon` của wall…). Emit chỉ xảy ra khi revision đổi nên compare O(n) một lần, không phải 60fps.

**Rủi ro**: thấp (thuần đọc). **Test**: unit test "đổi 1 furniture → `walls`/`rooms` giữ reference, `furniture` đổi reference". **Effort**: ~1.5–2h (gộp Mục 6 — `_lastRevision` xuống cuối).

### Mục 2 — CannonCollisionSystem revision-guard

**Phương án**: cache `staticEids`/`dynamicEids` + entry maps; rebuild chỉ khi `revision` đổi; luôn chạy vòng sweep dynamic; early-out khi không có dynamic entry.

**Files**: `src/engine/systems/collision/CannonCollisionSystem.ts`.

```ts
update(world) {
    if (world.revision !== this._lastRev) {
        this._staticEids  = Query.entitiesWith(world, Transform, ColliderAABB, StaticBody)
                                 .filter(id => !world.hasComponent(id, Grounded));
        this._dynamicEids = Query.entitiesWith(world, Transform, ColliderAABB, DynamicBody);
        gcStaticBodies(...); gcDynamicEntries(...);
        // sync static entries
        this._lastRev = world.revision;
    }
    if (this._dynamicEids.length === 0) return;   // early-out (đa số frame)
    // vòng sweep dynamic (giữ nguyên) trên cached list
}
```

`addComponent(DynamicBody)` lúc bắt đầu drag bump revision → `_dynamicEids` luôn được cập nhật kịp. **Rủi ro**: thấp. **Test**: `dispatcher.test.ts` + kéo va chạm. **Effort**: ~1h.

### Mục 3 — RenderSystem revision-guard (PHƯƠNG ÁN MỚI, xem §4)

**Phương án**: guard riêng vòng sync; `composer.render()` vẫn chạy mỗi frame.

**Files**: `src/engine/systems/scene/RenderSystem.ts` (1 file).

```ts
update(world, dt) {
    if (world.revision !== this._lastRevision) {
        const entities = Query.entitiesWith(world, Transform, Mesh);
        for (const entity of entities) { /* sync như cũ (WorldSpaceMesh + default) */ }
        this._lastRevision = world.revision;
    }
    this.composer.render(dt);            // luôn chạy: camera orbit không bump revision
    if (this.overlayScene.children.length > 0) { /* overlay như cũ */ }
}
```

> KHÔNG dùng `matrixAutoUpdate=false` (bản cũ) — xem khảo sát §4. **Rủi ro**: rất thấp. **Effort**: ~20 phút.

### Mục 4 — Query buffer reuse (hot systems)

Thêm biến thể `Query.entitiesWithInto(world, out[], ...classes)` ghi vào buffer truyền sẵn, chỉ áp cho 2–3 hot system thật cần. Làm **sau** Mục 1–3. **Effort**: ~1–2h.

### Mục 5 (gốc #4) — Broadphase

Đổi sang `SAPBroadphase` / spatial hash; nhưng `testOverlap` tự scan thủ công nên cần dùng `world.broadphase.aabbQuery` hoặc spatial hash riêng cho `staticEntries`. **Hoãn** tới khi có scene đo được chậm.

---

## 4. Khảo sát chốt phương án Phase 3 (RenderSystem)

Mục tiêu: xác định rủi ro của `matrixAutoUpdate=false` trước khi code.

**Ai thực sự có component `Mesh` (được RenderSystem sync)?**

| Factory | Thêm `Mesh`? | Dùng trong app thật? |
|---------|--------------|----------------------|
| `WallFactory` (`:72`) | ✅ (+ `WorldSpaceMesh` `:78`) | **Có** — tường |
| `GroundFactory` (`:29`) | ✅ | ❌ Dead (ground thật là collider headless `engine.ts:83`) |
| `spawnFurniture` (box, `:86`) | ✅ | ❌ Dead (chỉ `spawnFurnitureGLB` được gọi) |
| `spawnFurnitureGLB` | ❌ — chỉ `Model3D` | Có — nhưng **không qua RenderSystem** |

**Kết luận**:

1. Trong app thật **chỉ tường** có `Mesh` component. Furniture GLB dùng `Model3D`, được đặt vị trí imperative bởi `WallMountSystem` / `gizmoHandles` / `DragGhostController` / `FurniturePlacementSystem` — RenderSystem **không** đụng furniture.
2. Transform của tường chỉ được ghi bởi `WallGeometrySystem.ts:206`, mà system này có guard riêng (`:73`) → **chỉ chạy ở frame revision-đổi**. Không physics/gizmo nào ghi Transform tường.
3. → Mối lo "physics ghi `t.x` không bump revision" **chỉ áp dụng cho furniture (Model3D)**, không áp dụng cho tập Mesh-entity (tường). Vì vậy **revision-guard cho RenderSystem là an toàn tuyệt đối**, không cần `matrixAutoUpdate`.

**So sánh 2 phương án Phase 3:**

| Tiêu chí | Bản cũ (`matrixAutoUpdate=false`) | **Bản mới (revision-guard)** |
|----------|-----------------------------------|------------------------------|
| Files đụng | RenderSystem + ~4 nơi tạo/ghi mesh | **Chỉ RenderSystem** |
| Rủi ro | Trung bình (sót `updateMatrix` → im lặng hỏng) | **Rất thấp** |
| Effort | 2–3h | **~20 phút** |

**Đính chính**: review gốc xếp #2 là 🟠 với giả định "sync mọi mesh kể cả furniture". Thực tế chỉ tường (N nhỏ) → lợi ích thực khiêm tốn, hạ xuống 🟡. Chi phí GPU chính của system là `composer.render()` (không tối ưu được bằng guard).

---

## 5. Thứ tự thực hiện đề xuất

| Phase | Việc | Rủi ro | Effort |
|-------|------|--------|--------|
| 1 | SnapshotSystem reference-stable (+ Mục 6) | Thấp | ~2h |
| 2 | Collision revision-guard | Thấp | ~1h |
| 3 | RenderSystem revision-guard (bản mới §4) | Rất thấp | ~20ph |
| 4 | Query buffer reuse (hot systems) | Thấp | ~1–2h |
| — | Broadphase | hoãn | — |

Mỗi phase commit riêng + chạy test (`dispatcher.test.ts`, các `*.test.ts`) trước khi sang phase sau.
