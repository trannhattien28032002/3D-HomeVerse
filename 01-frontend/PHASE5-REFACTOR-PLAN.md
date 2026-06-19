# PHASE 5 — PHƯƠNG ÁN THỰC THI CHI TIẾT

> Đào sâu **Phase 5** của `FRONTEND-REFACTOR-PLAN.md`: gộp duplicate lớn + chẻ god-file ở vùng **gizmo / drag** (phức tạp nhất codebase).
> Tài liệu này = phương án (HOW), không phải lệnh sửa. Viết sau khi **đọc lại code thật** (sau Phase 1–4) → có chỉnh lại vài giả định của plan gốc.
> **Nguyên tắc tối thượng: KHÔNG đổi hành vi.** Drag là cảm-giác-tay (feel) — lệch 1 frame là người dùng nhận ra ngay.

---

## 0. Hiện trạng đã verify lại (khác plan gốc ở đâu)

Phase 4 đã **đổi đường dẫn** — plan gốc còn trỏ path cũ. Cập nhật:

| Plan gốc | Thực tế bây giờ |
|---|---|
| `views/PlanView2D/useFurnitureDrag.ts` | `src/app/features/plan2d/hooks/useFurnitureDrag.ts` (440 LOC) |
| `app/plan2d/` + `views/PlanView2D/` | đã gộp về `src/app/features/plan2d/` |

Và **một phần Phase 5 ĐÃ ngầm xong** qua các phase trước — phải trừ ra để không "gộp lại cái đã gộp":

- ✅ `shared/geometry/wallMount.ts` đã là **nguồn chân lý thuần**: `projectPointToWall`, `wallItemPose`, `mountTransform`, `occupancyLane`, `lanesConflict`, `wallItemOverlaps`, `wallNaturalRotY`, `remapWallItemOnResize/OnSplit`. Có `wallMount.test.ts`.
- ✅ `wallItemOverlaps` đã là **nguồn DUY NHẤT** của quy tắc xung đột — `wallOccupancy.occupiedOverlaps` chỉ delegate sang nó. Nghĩa là **clamp-t KHÔNG còn "fork 3 bản toán"** như plan gốc lo; cái còn fork là **orchestration + chính sách overlap** (xem §2 mục 5.2 — đây là chỉnh quan trọng nhất).
- ✅ `tagEntity/readEntity/tagWallId/...` (mục 2.3) đã có sẵn trong `gizmoHandles.ts:50-72`.
- ✅ Cast `__entity` đã đi qua helper.

**Hệ quả:** Phase 5 thực chất còn 2 việc "có thịt" + 3 việc chẻ-file cơ học. Đừng làm theo thứ tự số.

---

## 1. ⚠️ CỔNG BẮT BUỘC — Regression test TRƯỚC khi đụng

Plan gốc nói đúng: *"viết regression test drag 2D/3D/wall-item trước"*. Hiện trạng test (19 file `.test.ts`):

- CÓ: `wallMount.test.ts`, `alignment.test.ts`, `yaw.test.ts`, `floorClamp.test.ts`, `wallOccupancy.test.ts`, `wallTopology.test.ts`, `dispatcher.test.ts`.
- **THIẾU**: test cho **flow drag thật** — `slideWallItem`, `handleFurnitureTranslate`, `handleMoveWallItem`, `useFurnitureDrag` (project/apply/group).

### Việc 0 — golden test cho 3 kernel TRƯỚC mọi refactor

Vì các hàm này đụng THREE/Konva/Cannon, test theo 2 tầng:

1. **Pure kernel (rẻ, chạy headless):** trích input/output thuần để snapshot.
   - `slideWallItem`: dựng `World` tối thiểu (1 tường + 1 cửa + 1 kệ) → gọi với loạt (x,z) → assert `{success, isOverlapping, wo.t/wm.t/wm.side, model.root.position}`. Đây là **golden** để mọi bước sau diff-0.
   - `handleMoveWallItem`: World + cmd overlap/không-overlap → assert reject vs commit.
   - `handleFurnitureTranslate`: mock `collisionSystem.wouldCollide/clampMovement` → assert teleport-vs-clamp + `dragGhost.update/hide` được gọi đúng.
2. **Policy contract:** chốt **bằng test** sự khác biệt CỐ Ý giữa 3 đường (xem bảng §2/5.2) — để khi gộp kernel mà lỡ làm 2D "snap" thay vì "reject" thì test đỏ ngay.

> Định nghĩa "Done" của Việc 0: chạy `vitest`, 3 kernel có golden xanh, **commit riêng** trước khi refactor. Mọi PR Phase 5 sau đó phải giữ nguyên golden (chỉ được thêm, không sửa kỳ vọng).

---

## 2. ROADMAP ĐÃ XẾP LẠI THEO GIÁ TRỊ THỰC

### 5.1 — `WallItemTopology` accessor ⭐ (việc đáng làm nhất, RISK THẤP)

**Vấn đề thật (đã verify):** pattern `wo ? wo.x : wm?.x` lặp ở các site mà **không biết trước entity là opening hay mount** trên CÙNG một entity:

| File | Dòng | Đang làm |
|---|---|---|
| `gizmoHandles.ts` | 289, 306, 325-326 | `slideWallItem` đọc hostWallId/side/t |
| `gizmoHandles.ts` | 399, 422-423 | `flipWallItemByGizmo` đọc/ghi side |
| `GizmoSystem.ts` | 474, 478 | `snapWallItemRotation` đọc hostWallId/side |
| `furnitureHandlers.ts` | 95-124 | `handleMoveWallItem` đọc/ghi cả bộ |

**⚠️ Chỉnh plan gốc:** các site `wo!/wm!` trong `wallItemRanges.ts`, `WallMountSystem.ts`, `WallOpeningSystem.ts`, `wallTopology.ts:139/149`, `nodeHandlers.ts:74/81`, `describeScene.ts`, `serialize.ts` **KHÔNG phải smell** — chúng nằm trong `Query.entitiesWith(world, WallOpening)` (hoặc `WallMounted`), nên `!` được Query bảo chứng, type đã biết. **Không đụng chúng** (đụng vào là tăng rủi ro, giảm rõ ràng).

**Phương án:** thêm vào `src/engine/adapters/` (hoặc cạnh `wallRefs.ts`) một accessor đọc-ghi thuần-ECS:

```ts
// engine/adapters/wallItemTopology.ts
export type WallItemKind = "opening" | "mount";
export interface WallItemTopology {
    kind: WallItemKind;
    hostWallId: string;
    t: number;
    side: number;
}
/** Đọc topology của 1 wall-item bất kể opening/mount; null nếu không phải wall-item. */
export function getWallItemTopology(world: World, entity: string): WallItemTopology | null;
/** Ghi t/side/hostWallId trở lại đúng component đang có. */
export function setWallItemTopology(world: World, entity: string, patch: Partial<Omit<WallItemTopology,"kind">>): void;
```

- Nội bộ accessor là chỗ DUY NHẤT còn `getComponent(WallOpening) ?? getComponent(WallMounted)`.
- 4 site trên đổi sang gọi accessor → **xoá non-null `!`** ở các nhánh mount (smell C4).
- `isWallItem()` giữ nguyên (đã gọn).
- **Lưu ý hành vi cần bảo toàn:** opening side mặc định coi là `1` ở `snapWallItemRotation` (`wo ? wo.side : (wm?.side ?? 1)`), nhưng `describeScene` ghi opening side = `1` cứng còn `WallOpening.side` thật có thể ±1 (flip model). Accessor PHẢI trả `wo.side` thật (không hard-code), vì `slideWallItem`/`flipWallItemByGizmo` dùng side thật để lật cửa. **Không gộp luôn cái hard-code `1` của describeScene vào accessor** — đó là quyết định riêng của tầng AI, để nguyên.

**Risk:** thấp. **Done:** 4 site đi qua accessor; golden `slideWallItem`/`handleMoveWallItem` xanh; `rg "getComponent\(.*WallMounted\)"` chỉ còn trong accessor + các Query-loop hợp lệ.

---

### 5.2 — Kernel chung cho "wall-item move" ⭐ (RISK CAO — đọc kỹ phần policy)

**Chỉnh lớn so với plan gốc.** Plan gốc nói "3 bản clamp-t độc lập → gộp 1 `resolveWallItemMove` cả 3 cùng gọi". Sự thật sau khi đọc code: **3 đường có CHÍNH SÁCH overlap KHÁC NHAU CÓ CHỦ ĐÍCH** — gộp ngây thơ = đổi hành vi.

| Đường | File | Tìm tường | Khi overlap | Ghi đâu |
|---|---|---|---|---|
| 3D gizmo `slideWallItem` | `gizmoHandles.ts:279` | host cố định | **SNAP** ra khỏi vùng đè (`clampTAgainstOccupied`), không bao giờ từ chối | ghi component **+ model.root** ngay frame đó + clamp Y cho kệ |
| Command `handleMoveWallItem` | `furnitureHandlers.ts:92` | host từ cmd | **REJECT** (giữ nguyên t cũ) | chỉ ghi component, để WallMountSystem suy pose |
| 2D drag `projectWallItem` | `useFurnitureDrag.ts:160` | **quét tường gần nhất** + hysteresis (`projectToNearestWall`) | **REJECT** (không set pending) | ghi Konva node imperative; commit qua dispatch `MOVE_WALL_ITEM` |

→ Phần **toán xung đột** đã chung rồi (`wallItemOverlaps`/`occupancyLane`). Phần còn fork là **(a) tìm tường, (b) snap-vs-reject, (c) đích ghi**. Ba thứ này KHÔNG nên ép về 1 hàm trả cùng shape.

**Phương án đúng — trích KERNEL hẹp, giữ policy ở call-site:**

```ts
// shared/geometry/wallMount.ts — thêm
export type OverlapPolicy = "snap" | "reject";
export interface WallItemTResult { t: number; overlapping: boolean; }
/**
 * Cho 1 tường + item, giải t cuối từ t mong muốn:
 *  - "reject": clamp [minT,maxT], overlapping = wallItemOverlaps(...) (caller tự quyết giữ/commit).
 *  - "snap"  : đẩy ra khỏi range cùng-lane (clampTAgainstOccupied) rồi clamp biên; overlapping tính tại t cuối.
 * KHÔNG đọc World, KHÔNG đụng THREE — thuần số, test được.
 */
export function resolveWallItemT(
    t: number, halfWidthT: number, minT: number, maxT: number,
    lane: number, occupied: WallItemRange[], policy: OverlapPolicy,
): WallItemTResult;
```

- `clampTAgainstOccupied` (hiện private trong `gizmoHandles.ts:373`) **chuyển vào** `wallMount.ts` làm nội bộ của nhánh `"snap"`.
- 3 call-site giữ nguyên: tìm tường (host hoặc nearest), gọi kernel với policy của mình, rồi tự ghi (ECS / Konva). `slideWallItem` thêm phần pose+Y-clamp **ở ngoài** kernel.
- Lợi: quy tắc clamp/overlap về **1 nguồn test được**; vẫn giữ đúng feel từng đường.

**Risk:** cao (vùng cảm-giác-tay). Bắt buộc golden §1 + verify browser cả 3: kéo cửa trên 1 tường (3D), kéo cửa nhảy tường (2D), `MOVE_WALL_ITEM` qua AI/command. **Không làm trước 5.1** (5.1 dọn accessor giúp call-site gọn trước khi đụng toán).

---

### 5.3 — Furniture translate (HẠ ƯU TIÊN — gần như đã chung)

Plan gốc xếp đây là "hợp nhất". Thực tế: phần chung **đã là** `resolveAlignment` (cả 3D `handleFurnitureTranslate:478` lẫn 2D `applyFurnitureDrag:193` đều gọi). Phần còn lại **khác backend bản chất**, không nên ép gộp:

- 3D: `collisionSystem.wouldCollide` + `clampMovement` (Cannon sweep, có trục Y) + `clampCenterAboveFloor` + `dragGhost`.
- 2D: `collidesWithWalls` (SAT miter-poly, KHÔNG có Y) + `wouldFurnitureCollide` (hỏi engine ở Y thật) + `lastSafePos`.

→ Ép về "1 compute-pose thuần" chỉ bóc lại đúng `resolveAlignment` (đã chung) — **payoff thấp, risk thật**. **Đề xuất:** bỏ gộp; thay vào đó chỉ (1) thêm comment chỉ rõ `resolveAlignment` là seam chung ở cả 2 site, (2) thống nhất tên biến (`ix/iz` 3D vs `intendedX/Y` 2D) cho dễ đối chiếu. Đóng mục bằng tài liệu, không bằng code.

---

### 5.4 — Chẻ `GizmoSystem.ts` (612 LOC → mục tiêu < ~300)

Cấu trúc hiện tại đã khá sạch (nhiều logic đã ở `gizmoHandles.ts`, `pointerRotate.ts`, `DragGhostController`, `WallOpeningPreviewController`). Còn nặng vì **3 trách nhiệm trộn trong 1 class**. Tách theo seam tự nhiên, **giữ `GizmoSystem` làm orchestrator mỏng**:

1. `GizmoPicking` — `onMouseDown`/`onContextMenu`/`resolvePick` wiring + 3 scratch array (`pickObjects/wallPickObjects/roomPickObjects`) + `clearSelection`. (thuần input→event)
2. `GizmoDragLifecycle` — `onDraggingChanged` (217-304) + state body-swap (`draggingEntity`, `releaseFramesLeft`, Static↔Dynamic) + `update()` release-frames. Đây là phần phức tạp nhất; tách ra cô lập được state machine.
3. `WallItemGizmoAdapter` — nhánh wall-item trong `onObjectChange` + `snapWallItemRotation` + `updateOpeningPreview` + `applyGizmoAxes`.

`GizmoSystem` còn lại: constructor wiring + `onObjectChange` dispatch 2 nhánh + setMode. **Thứ tự an toàn:** tách 1 (picking, độc lập nhất) → 3 (wall adapter) → 2 (lifecycle, đụng state nhiều nhất, làm cuối). Mỗi tách 1 PR + verify.

**Risk:** trung-cao (state body-swap dễ rò). Golden không bắt được rò body → **bắt buộc verify browser**: kéo đồ rồi thả, undo giữa lúc kéo, xoá khi đang gắn gizmo.

---

### 5.5 — Chẻ `useFurnitureDrag.ts` (440 LOC)

Hook này đã gom đúng chỗ (R7) nhưng trộn **4 gesture**. Tách theo gesture, mỗi cái 1 hook con nhận chung refs:

1. `useWallItemDrag` — `projectWallItem` + `pendingWallMoveRef` + nhánh wall-item của `onDragStart/Move/End`.
2. `useGroupDrag` — `groupDragRef` + `applyGroupFollow` + `groupHitsWall` + group-branch của Start/Move/End.
3. `useGroupRotate` — `groupTransformCommittedRef` + nhánh group của `onTransformEnd` (377-429).
4. Single drag/rotate ở lại hook gốc `useFurnitureDrag` làm **composer** spread handlers.

Giữ nguyên `guideRef/collideRef/showCollide/renderGuide` ở composer (dùng chung). Lưu ý `onDragMove`/`onDragEnd`/`onTransformEnd` phải **rẽ nhánh trước** (wall-item → group → single) đúng thứ tự hiện tại — đừng đổi thứ tự kiểm tra.

**Risk:** trung. Test được nhiều hơn 5.4 (logic thuần ref). Viết unit cho `applyGroupFollow`/`groupHitsWall` trước khi tách.

---

### 5.6 — Chẻ page/panel lớn (RISK THẤP, làm bất cứ lúc nào)

Độc lập với gizmo, không cần golden drag — có thể chen vào giữa khi cần đổi nhịp:

- `ProjectsPage.tsx` (~450) → `<ProjectsSidebar>` + `<ProjectGrid>` + `useProjectList()` (hook đã có từ Phase 4.3 — kiểm tra rồi tái dùng).
- `MaterialSidebar/index.tsx` (459) → `<ObjectMaterialPanel>`/`<WallMaterialPanel>`/`<FloorMaterialPanel>`.
- `EditorPage.tsx` → `useEditorLoadingProgress()` + `<MaterialHintToast>` (đã được nhắc rút ở 2.2).

**Done:** mỗi file < ~250 LOC, không đổi props/hành vi (pure-extract component).

---

## 3. THỨ TỰ THỰC THI ĐỀ XUẤT (không theo số thứ tự)

```
0. Golden test 3 kernel (slideWallItem / handleMoveWallItem / handleFurnitureTranslate)  ← CỔNG
1. 5.1  WallItemTopology accessor            (risk thấp, dọn đường cho 5.2)
2. 5.6  Chẻ page/panel                       (risk thấp, đổi nhịp, không phụ thuộc gì)
3. 5.2  Kernel resolveWallItemT + policy     (risk cao, sau khi 5.1 dọn xong)
4. 5.5  Chẻ useFurnitureDrag                 (test được, làm trước 5.4)
5. 5.4  Chẻ GizmoSystem (picking→wall→lifecycle)
6. 5.3  Tài liệu seam furniture-translate    (không gộp code)
```

Lý do: việc rẻ/an-toàn trước để lấy đà + giảm bề mặt va chạm cho việc nguy hiểm; 5.1 phải đứng trước 5.2 vì 5.2 đụng đúng các call-site mà 5.1 vừa dọn.

---

## 4. BẤT BIẾN PHẢI BẢO TOÀN (checklist mỗi PR)

- [ ] Golden 3 kernel **không đổi kỳ vọng** (chỉ thêm case).
- [ ] `vitest` toàn bộ + `tsc` sạch.
- [ ] Verify browser **đúng gesture vừa đụng**:
  - 5.1/5.2: kéo cửa & kéo kệ trong 3D (trượt + lật + đè đỏ + clamp Y kệ); kéo cửa 2D nhảy tường; `MOVE_WALL_ITEM` (command/AI).
  - 5.4: thả gizmo → đồ về StaticBody (không "trôi" mãi DynamicBody); undo giữa drag; Delete khi gắn gizmo.
  - 5.5: kéo nhóm chặn tường + cho chồng; xoay nhóm hủy khi chạm tường; kéo đơn.
- [ ] **Không trộn** refactor với fix bug: phát hiện bug khi gộp → ghi ra, PR riêng (đặc biệt nghi vấn `intendedPose.qy` ở `gizmoHandles.ts:353` dùng `iPose.rotY/2` — trông như nhầm `rotY` với half-angle; **chỉ ghi nhận, không sửa trong PR refactor**).
- [ ] Engine command/dispatcher core **không đụng**.

---

## 5. Phụ lục — điểm nghi vấn phát hiện khi đọc (tách bug khỏi refactor)

1. `gizmoHandles.ts:353-362` (`intendedPose` cho ghost khi overlap): `const iHalf = iPose.rotY / 2;` rồi `qy: Math.sin(iHalf)`. `iPose.rotY` là **góc yaw đầy đủ**, chia 2 đúng cho half-angle quaternion — *có vẻ đúng*, nhưng đặt tên `iHalf` dễ gây hiểu nhầm. Để nguyên, chỉ đổi tên/comment khi 5.2 chạm tới.
2. `furnitureHandlers.ts:107` fallback `t = 0.5` khi `minT >= maxT` (tường ngắn hơn item) — khác `slideWallItem` (trả `fits=false`, **giữ t cũ**). Đây là khác biệt hành vi tiềm ẩn giữa command và gizmo cho tường siêu ngắn; ghi vào policy-contract test của 5.2, **không tự ý đồng nhất**.

---

*Phương án cho Phase 5 — đối chiếu code thật sau Phase 1–4. Báo cáo + lộ trình, không sửa code.*
