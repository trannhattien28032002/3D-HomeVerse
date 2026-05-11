# Code Review — 3D HomeVerse / 01-frontend
> Thực hiện: 2026-04-29 | Build status: ✅ 0 errors

---

## 1. Kiến trúc tổng quan

```
React (Plan2DPage)
   │  dispatch(EngineCommand)
   ▼
engine.ts  ──┬──► NodeRegistry  (source of truth)
             │
             ├──► ECS World
             │      ├── WallGeometrySystem   (geometry + miter)
             │      ├── CannonCollisionSystem (physics)
             │      ├── GizmoSystem          (3D transform handles)
             │      ├── RenderSystem         (Three.js render)
             │      └── SnapshotSystem       (emit state → React)
             │
             └──► EngineEvents.emit("snapshot") → useFloorPlanStore → Plan2DPage re-render
```

**Điểm mạnh:**
- Node-driven topology: tường được derive từ nodes, không lưu trực tiếp tọa độ
- ECS patterns rõ ràng (System / World / Component / Query)
- Command bus rõ ràng: UI → `dispatch()` → ECS, không có two-way binding lộn xộn
- SnapshotSystem là single emit point, change detection tốt (hash compare)

---

## 2. Đánh giá từng module

### ✅ `NodeRegistry.ts` — Tốt
- Đúng vai trò: single source of truth
- `nodeCaps` được ghi bởi WallGeometrySystem và đọc bởi SnapshotSystem → clean separation
- `deleteNode()`, `connectWall()`, `disconnectWall()` đầy đủ

> **Vấn đề nhỏ:** `nextId` bắt đầu từ 1, nhưng `INITIAL_NEXT_NODE_ID = 20`. UI dùng counter riêng. Nếu engine seed thêm nodes sau init, có thể bị trùng ID.

### ✅ `WallGeometrySystem.ts` — Tốt (sau các fix)
- Miter/Bevel algorithm chia 3 phase rõ: build node lists → compute miters → rebuild mesh
- Bevel fallback hợp lý với `MITER_LIMIT = 2.5`
- Change detection tốt: bỏ qua rebuild nếu polygon không đổi
- Z-axis fix (`shape.moveTo(x, -z)`) đã áp dụng đúng

> **Vấn đề 1 — Memory leak tiềm ẩn:** `updateCapMesh` tạo `new THREE.MeshStandardMaterial()` mỗi lần node cap mới xuất hiện. Material cũ KHÔNG được `.dispose()`.  
> **Fix:** Lưu material cùng với mesh, gọi `mat.dispose()` khi remove.

> **Vấn đề 2 — HEIGHT hardcode:** `const HEIGHT = 1` trong `updateCapMesh`. Cap luôn cao 1 unit dù wall có thể cao hơn.  
> **Fix:** Đọc `WallSize.height` từ bất kỳ connected wall nào.

> **Vấn đề 3 — `wallEntities.length === 0` early return:** Nếu không có walls, cap meshes sẽ không được cleanup.

### ✅ `engine.ts` — Tốt (sau các fix)
- `MERGE_NODE` reroute đúng: update `WallNodes`, `connectWall`, `disconnectWall`, invalidate polygon
- `REMOVE_WALL` cleanup orphan nodes
- `ADD_WALL` invalidate neighbor polygons

> **Vấn đề — Default room seed:** `DEFAULT_NODE_DEFS` có node 5 trùng tọa độ node 1 (`{ id: 5, x: 6, z: -5 }`). Không có wall nào nối node 5 → orphan node tồn tại ngay từ đầu.

> **Vấn đề — `_recomputeWallAABB` vs `WallGeometrySystem`:** Cả hai đều update `Transform`, `WallSize`, `ColliderAABB`. Có sự trùng lặp logic. Nếu AABB được set bởi `_recomputeWallAABB` nhưng WallGeometrySystem lại override ngay frame sau, không có conflict — nhưng khó debug.

### ✅ `Plan2DPage.tsx` — Tốt (sau rewrite)
- Mode separation rõ ràng: `Layer listening={toolMode === "select"}`
- Node handles chỉ render trong select mode
- Chain drawing hoạt động đúng
- `MERGE_NODE` dispatch khi snap-to-connect

> **Vấn đề 1 — ID counter reset khi remount:** `_nextNodeId` và `_nextWallId` là module-level variables. Nếu component unmount/remount (hot reload, route change), counter reset về `INITIAL_NEXT_NODE_ID` và có thể trùng với ID đã tồn tại trong engine.  
> **Fix:** Đọc max ID từ snapshot lúc init, hoặc engine expose `nextAvailableId()`.

> **Vấn đề 2 — Snap radius không visual:** User không thấy snap indicator khi cursor gần node. Layer 5 hiện dot nodes nhưng không highlight node nào đang được snap tới.

> **Vấn đề 3 — `dispatch` là module-level function gọi `window.gameEngine`:** Nếu engine chưa init, lệnh dispatch bị nuốt silently (không có warning).

### ✅ `SnapshotSystem.ts` — Tốt
- Hash comparison đúng để tránh re-render mỗi frame
- Cap hash thêm vào đúng

> **Vấn đề:** Hash dùng `.toFixed(2)` cho cap points nhưng `.toFixed(3)` cho wall centers và `.toFixed(4)` cho nodes. Không nhất quán — có thể gây miss hoặc over-detect thay đổi.

### ✅ `GizmoSystem.ts` — Tốt
- WallNodes entities bị exclude khỏi pick list → không gizmo trên walls

> **Vấn đề:** Khi không có entity nào được pick, `controls.detach()` + emit `entitySelected: null` mỗi frame mousedown trên empty space. Cần check nếu đã detached rồi thì skip.

### ⚠️ `useFloorPlanStore.ts` — Trung bình
- Clean conversion từ world → px
- Expose `caps: Cap2D[]`

> **Vấn đề:** `window.gameEngine?.api.events.lastSnapshot` được đọc trong `useState` initializer — chạy trong React render phase. Nếu engine init async, hook lấy `null` và không retry.

---

## 3. Tóm tắt vấn đề theo mức độ ưu tiên

| # | Vấn đề | Mức độ | File |
|---|--------|--------|------|
| 1 | **ID counter reset sau remount** | 🔴 Critical | Plan2DPage.tsx |
| 2 | **Material leak trong `updateCapMesh`** | 🟠 High | WallGeometrySystem.ts |
| 3 | **Orphan node 5 trong default room** | 🟠 High | engine.ts |
| 4 | **HEIGHT hardcode trong cap mesh** | 🟡 Medium | WallGeometrySystem.ts |
| 5 | **`_recomputeWallAABB` duplicate logic** | 🟡 Medium | engine.ts |
| 6 | **Snap indicator thiếu visual** | 🟡 Medium | Plan2DPage.tsx |
| 7 | **Hash precision không nhất quán** | 🟡 Medium | SnapshotSystem.ts |
| 8 | **GizmoSystem: detach mỗi frame** | 🟢 Low | GizmoSystem.ts |
| 9 | **dispatch silent fail nếu engine null** | 🟢 Low | Plan2DPage.tsx |
| 10 | **NodeRegistry `nextId` conflict potential** | 🟢 Low | NodeRegistry.ts |

---

## 4. Đề xuất cải tiến tiếp theo

### Ngắn hạn (1-2 ngày)
1. Fix orphan node 5 trong `DEFAULT_NODE_DEFS`
2. Fix material leak trong `updateCapMesh`
3. Expose `lastUsedIds` từ engine để Plan2DPage init counter đúng
4. Đồng nhất hash precision về `.toFixed(3)`

### Trung hạn (1 tuần)
5. **Room detection:** Graph topology đã đủ để detect closed loops → tô màu phòng
6. **Visual snap indicator:** Highlight node khi cursor trong `SNAP_RADIUS`
7. **Serialization:** `NodeRegistry.snapshot()` đã có → thêm save/load JSON

### Dài hạn
8. **Undo/Redo:** Command pattern đã sẵn sàng → add `CommandHistory` ring buffer
9. **Wall height per-segment:** `WallSize.height` đã có component nhưng UI chưa cho chỉnh
10. **Code splitting:** Bundle 1.2MB → lazy load Three.js + Cannon.js

---

## 5. Kết luận

Codebase ở trạng thái **tốt về kiến trúc**, các pattern được áp dụng đúng (ECS, Command bus, Node-driven topology). Các vấn đề hiện tại chủ yếu là **edge cases và memory hygiene** — không có lỗi kiến trúc nghiêm trọng nào. Hệ thống đủ ổn định để tiếp tục phát triển features mới.
