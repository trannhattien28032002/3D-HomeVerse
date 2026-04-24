# Refactor: ECS = Source of Truth

## Mục tiêu

Chuyển từ kiến trúc dual-store (Zustand giữ wall data + ECS giữ wall data) sang kiến trúc một chiều rõ ràng:

```
UI  →  Command  →  ECS (source of truth)  →  Snapshot  →  UI render
```

Zustand chỉ còn giữ **UI state thuần túy** (tool, selection). Wall data sống hoàn toàn trong ECS.

---

## User Review Required

> [!IMPORTANT]
> **Thay đổi breaking:** `usePlanStore` hiện tại bị xóa hoàn toàn. Mọi code đang import `usePlanStore` phải cập nhật.

> [!WARNING]
> **Drag clamp:** `dragBoundFunc` của Konva chạy **synchronous** nên vẫn cần `clampMovement2D()` là một **query** (không phải command). Không thể làm async ở bước này.

> [!NOTE]
> **GizmoSystem:** Không cần thay đổi — nó đã cập nhật ECS trực tiếp. Chỉ cần bỏ emit `entityMoved` cũ (thay bằng snapshot system tự động).

---

## Proposed Changes

### 1. Command System

#### [NEW] `engine/commands/EngineCommands.ts`

Định nghĩa tất cả command mà UI có thể gửi vào ECS:

```ts
export type EngineCommand =
  | { type: 'ADD_WALL';    wallId: number; x: number; z: number; w: number; d: number; rotY: number }
  | { type: 'MOVE_WALL';   wallId: number; x: number; z: number }
  | { type: 'RESIZE_WALL'; wallId: number; w: number; d: number; rotY: number }
  | { type: 'REMOVE_WALL'; wallId: number }
  | { type: 'BEGIN_DRAG';  wallId: number }
  | { type: 'END_DRAG';    wallId: number }
```

---

### 2. Snapshot System

#### [MODIFY] `engine/events/EngineEvents.ts`

Thêm event `snapshot` vào `EngineEventMap`:

```ts
export type WallSnapshot = {
  wallId: number;
  x: number; y: number; z: number;
  w: number; d: number;
  rotY: number;
};

export type ECSSnapshot = {
  walls: WallSnapshot[];
};

// Thêm vào EngineEventMap:
snapshot: ECSSnapshot;
```

#### [NEW] `engine/systems/SnapshotSystem.ts`

System chạy cuối mỗi frame — thu thập tất cả wall entities và emit snapshot:

```ts
export class SnapshotSystem extends System {
  private events: EngineEvents;
  private lastHash = '';

  update(world: World): void {
    // Query tất cả entities có WallTag + Transform + WallSize
    // Build ECSSnapshot
    // Chỉ emit nếu data thực sự thay đổi (so sánh hash)
    events.emit('snapshot', snapshot);
  }
}
```

---

### 3. Engine Core

#### [MODIFY] `engine/engine.ts`

**Bỏ:**
- `addWall`, `updateWall`, `removeWall` trực tiếp
- `wallEntityIds`, thay bằng chỉ `wallEntityByWallId`

**Thêm:**
- `dispatch(command: EngineCommand): void` — xử lý tất cả commands
- `SnapshotSystem` vào pipeline

**`EngineApi` mới:**
```ts
export type EngineApi = {
  events: EngineEvents;
  dispatch: (command: EngineCommand) => void;
  clampMovement2D: (wallId: number, x: number, z: number) => { x: number; z: number };
};
```

**Logic `dispatch`:**
```
ADD_WALL    → createWall(world, scene, ...)
MOVE_WALL   → getComponent(Transform) → set x, z
RESIZE_WALL → getComponent(WallSize, ColliderAABB, Mesh) → rebuild geometry
REMOVE_WALL → scene.remove + world.destroyEntity
BEGIN_DRAG  → removeComponent(StaticBody) + addComponent(DynamicBody)
END_DRAG    → removeComponent(DynamicBody) + addComponent(StaticBody)
```

---

### 4. Zustand Stores

#### [MODIFY] `app/store/useUIStore.ts`

Mở rộng để chứa toàn bộ UI state (hiện chỉ có `isSidebarOpen`):

```ts
type UIState = {
  // Existing
  isSidebarOpen: boolean;

  // Thêm mới
  selectedTool: 'select' | 'draw';
  selectedWallId: number | null;
  drawStartPoint: { x: number; y: number } | null;
  viewportWidth: number;
  viewportHeight: number;

  // Actions
  setSelectedTool: (tool: 'select' | 'draw') => void;
  setSelectedWallId: (id: number | null) => void;
  setDrawStartPoint: (point: { x: number; y: number } | null) => void;
  syncViewport: (w: number, h: number) => void;
  // ... sidebar actions
}
```

#### [DELETE] `app/store/usePlanStore.ts`

Bị xóa hoàn toàn — không còn tồn tại.

#### [NEW] `app/store/useWallStore.ts`

**Không phải Zustand store thông thường.** Là một custom React hook dùng `useState` + subscribe vào ECS snapshot event. Chuyển đổi world coords → px coords để Konva render:

```ts
// Subscribes to engine snapshot → converts to 2D pixel coords
export function useWallStore(): Wall2D[] {
  const [walls, setWalls] = useState<Wall2D[]>([]);

  useEffect(() => {
    const engine = window.gameEngine;
    if (!engine) return;
    return engine.api.events.on('snapshot', (snap) => {
      const { viewportWidth, viewportHeight } = useUIStore.getState();
      setWalls(snap.walls.map(w => worldToPx(w, viewportWidth, viewportHeight)));
    });
  }, []);

  return walls;
}
```

---

### 5. React Components

#### [MODIFY] `app/components/Canvas.tsx`

**Bỏ:**
- Subscribe `entityMoved` để update Zustand (giờ snapshot tự làm)
- Import `usePlanStore`

**Giữ:**
- Khởi tạo engine với initial walls từ ECS defaults (không cần từ store nữa)

#### [MODIFY] `app/pages/Plan2DPage.tsx`

**Bỏ:**
- `usePlanStore` → dùng `useUIStore` + `useWallStore`
- `updateEngineWall()` trực tiếp → thay bằng `dispatch`
- `window.gameEngine.api.removeWall?.(id)` trực tiếp → `dispatch`

**Thay bằng:**
```ts
// Lấy walls từ ECS snapshot
const walls = useWallStore();

// Dispatch commands
const dispatch = (cmd) => window.gameEngine?.api.dispatch(cmd);

// Drag end
dispatch({ type: 'MOVE_WALL', wallId, x: worldX, z: worldZ });

// Add wall
dispatch({ type: 'ADD_WALL', wallId: nextId, x, z, w, d, rotY });

// Delete
dispatch({ type: 'REMOVE_WALL', wallId: selectedId });
```

#### [MODIFY] `app/App.tsx`

- Remove `syncViewport` from `usePlanStore`
- Gọi `useUIStore.getState().syncViewport(...)` thay thế

---

## Data Flow (New)

```
2D Drag (Konva dragBoundFunc)
  ↓ clampMovement2D(wallId, x, z)   ← synchronous query, không phải command
  ECS/Rapier trả lại vị trí hợp lệ

2D Drag End / Transform End
  ↓ dispatch({ type: 'MOVE_WALL' | 'RESIZE_WALL', ... })
  ECS cập nhật Transform + WallSize
  SnapshotSystem phát hiện thay đổi → emit snapshot

2D Add Wall
  ↓ dispatch({ type: 'ADD_WALL', wallId, ... })
  createWall() tạo entity
  SnapshotSystem emit snapshot → useWallStore cập nhật → Konva re-render

3D Gizmo Drag
  GizmoSystem → cập nhật ECS Transform trực tiếp
  SnapshotSystem emit snapshot → useWallStore → Konva re-render

Delete
  ↓ dispatch({ type: 'REMOVE_WALL', wallId })
  destroyEntity + scene.remove
  SnapshotSystem emit snapshot (wall biến mất khỏi danh sách)
```

---

## Verification Plan

### Automated (TypeScript)
```
npx tsc --noEmit
```
Không được có lỗi type.

### Manual
1. Switch 3D → 2D: walls hiện đúng vị trí
2. Kéo tường trong 2D → Konva cập nhật ngay, preview khớp
3. Kéo tường trong 3D → Konva 2D cũng update tương ứng
4. Vẽ tường mới trong 2D → xuất hiện cả trong Konva lẫn scene 3D
5. Xóa tường → biến mất ở cả 2 view
6. Resize cửa sổ → walls không bị nhảy vị trí

---

## File Summary

| File | Hành động |
|---|---|
| `engine/commands/EngineCommands.ts` | **[NEW]** |
| `engine/systems/SnapshotSystem.ts` | **[NEW]** |
| `app/store/useWallStore.ts` | **[NEW]** (custom hook) |
| `engine/events/EngineEvents.ts` | **[MODIFY]** thêm snapshot types |
| `engine/engine.ts` | **[MODIFY]** dispatch + SnapshotSystem |
| `app/store/useUIStore.ts` | **[MODIFY]** mở rộng UI state |
| `app/components/Canvas.tsx` | **[MODIFY]** simplify |
| `app/pages/Plan2DPage.tsx` | **[MODIFY]** dùng dispatch + useWallStore |
| `app/App.tsx` | **[MODIFY]** dùng useUIStore |
| `app/store/usePlanStore.ts` | **[DELETE]** |
