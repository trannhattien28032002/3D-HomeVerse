# AI Agent — Kế hoạch thi công (Build Plan)

> **Nguồn:** chia nhỏ từ `AI-ARCHITECT-ASSISTANT-PLAN.md` (Phương án B). File này là **execution plan**:
> mỗi Work Package (WP) map vào file code THẬT đã verify, có tiêu chí *Done-when* đo được.
> Trạng thái: **WP0–WP3 (3/5 macro) đã thi công & verify** · Provider: **Google Gemini** · Cập nhật: 2026-06-16
> **Phạm vi M1: CHỈ 1 tầng** (multi-floor = milestone riêng). Xem §Phạm vi M1.

## Nguyên tắc bám code (đã verify tồn tại)

| Lớp kiến trúc | Điểm bám thật trong repo | Đã đọc |
|---|---|---|
| Dispatch (mutation chokepoint) | `src/engine/
commands/dispatcher.ts` — `dispatch` / `dispatchAsync` | ✅ |
| Command shapes | `src/engine/commands/EngineCommands.ts` — union ~25 lệnh | ✅ |
| Facade UI dùng để dispatch | `src/app/hooks/useEngineApi.ts` — `dispatchAsync`, `withTransaction`, `asyncTransaction`, `nextNodeId`, `nextWallId` | ✅ |
| Perception source | `src/engine/serialization/serialize.ts` — `serializeScene(engine): SceneDocument` | ✅ |
| Scene shape | `src/engine/serialization/SceneDocument.ts` — nodes/walls/furniture/wallItems/floors | ✅ |
| Catalog grounding | `src/engine/catalog/FurnitureCatalog.ts` — `catalogMap`, `getCatalogItem`, `getFootprint2D`, `getCollisionBox`, `getPlacement` | ✅ |
| Room detection | `src/engine/systems/annotation/RoomSystem.ts` — `RoomGeometry` (points/area/key = sorted nodeIds) | ✅ |
| Catalog data | `src/data/catalog/objects.json` (v2, `objects[]`), `materials.json` | ✅ |

> **Bất biến:** AI **không** chạm ECS / Three.js / toạ độ thô. AI chỉ biên dịch ngôn ngữ → `EngineCommand[]`,
> đẩy qua `useEngineApi.dispatchAsync` trong `asyncTransaction` (gói cả lượt → undo 1 phát). Đa số đảm bảo (reconcile item bám tường, undo) kế thừa miễn phí.
> **⚠️ Ngoại lệ:** **collision KHÔNG kế thừa cho `PLACE_FURNITURE`** (chỉ enforce trên MOVE/ROTATE tương tác — xem Sai khác #7). WP4 solver phải tự tránh chồng.

---

## 📐 Phạm vi M1 (chốt 2026-06-16)

**CHỈ làm 1 tầng.** Brief nhiều tầng (vd "nhà 2 tầng 180m²") **out-of-scope M1**.
- **Lý do (gap kiến trúc, không phải gap phase):** toàn bộ trục perception/solver (`describeScene`, `RoomGeometry`, WP4) sống trên **mặt phẳng XZ đơn**. `SceneDocument.floors` là *mặt sàn* (polygon), **KHÔNG** phải *storey*. Engine chưa có khái niệm tầng.
- Multi-floor = **milestone riêng**, phải giải ở tầng engine/serialization TRƯỚC (khái niệm storey + chuyển tầng), không nhồi vào plan AI.
- **Mốc nghiệm thu M1** = 1 tầng, 3–4 phòng, nội thất **không chồng** + **có style**. Đừng lấy brief 2 tầng làm mốc — đó là phép thử trung thực cho WP4/WP6.

### Style grounding — "AI biết thế nào là Scandinavian/tối giản?"
Model **đã biết khái niệm** style (Gemini học sẵn). Nút thắt là **dịch khái niệm → lựa chọn cụ thể trong catalog/material của repo**. Style sống ở 3 tầng:
1. **Vật liệu** (palette): sàn gỗ sáng, tường trắng, vải trung tính → cần **`tone`** trên material.
2. **Chọn đồ**: đường nét sạch, dáng thấp → cần **`style`/`traits`** trên object.
3. **Mật độ + bố cục**: tối giản = ít đồ, nhiều khoảng trống → luật trong **WP5 skill** + **WP4 solver**.

→ **Điều kiện cần:** gán tag (xem **WP-DATA**). Thiếu tag, AI chỉ đoán style qua tên món (fuzzy) → fidelity rất thấp.
→ **Giới hạn:** "có đúng Scandinavian không" **code KHÔNG verify được** (chủ quan) → eval bằng rubric / LLM-as-judge, không unit test (khác với "không chồng" — test được bằng footprint).

---

## 📍 Trạng thái thi công (cập nhật 2026-06-16)

| WP | Trạng thái | Ghi chú |
|---|---|---|
| §5 decision gate | ✅ **Chốt 5a** | Loop ở backend, API key server-only |
| WP0 `describeScene` | ✅ **Done + test** | 4 unit test, JSON < 2KB/phòng |
| WP1a FE agent core | ✅ **Done + test** | dispatchBridge / toolRegistry / AgentClient, test headless |
| WP1b kênh 5a + chat | ✅ **Done + verify live** | backend domain `ai`, BackendTransport, ráp `AIChatbot` |
| WP2 `searchCatalog` | ✅ **Done + test** | tool search thay catalog tĩnh trong prompt; 8 test, chỉ trả id thật |
| WP3 macro tools | ✅ **3/5 macro** | createRoom + addOpening + resizeRoom + guard constraint; furnishRoom→WP4, setSurfaceMaterial→WP7 |
| WP-DATA tag style/tone | ⏳ chưa làm | **điều kiện cần** cho style (WP5/WP7); khảo sát 2026-06-16: 107 obj + 63 mat hiện **0 tag**, material thiếu `tone` |
| WP4 solver + WP4-EVAL | 📐 **spec chi tiết** | **tiếp theo**; bất biến đã sửa: `PLACE_FURNITURE` không check collision → solver tự chống chồng; cần calibrate rotY/hướng trước khi code |
| WP5 – WP7 | ⏳ chưa làm | |

**Provider: Google Gemini** (đổi từ Anthropic ngày 2026-06-12 do hết credit). SDK `@google/genai`, model mặc định `gemini-2.5-flash` (env `GEMINI_MODEL` đổi `gemini-2.5-pro` / `gemini-2.5-flash-lite`). Có retry+backoff cho lỗi tạm thời (503/429). Wire FE↔BE **trung lập** → đổi provider chỉ sửa `ai.service.ts`.

### ⚠️ Sai khác đã phát hiện so với plan gốc (verify code thật, file đang `draft`)
1. **`describeScene` KHÔNG dựng trên `serializeScene`** — format lưu file mất `entityId` (WP7 cần tham chiếu entity, không bịa id). Đọc thẳng ECS world, giữ entityId.
2. **`RoomGeometry.key` = sorted nodeIds, KHÔNG phải `wallIds`** (WP0 output shape ghi sai). Lấy rooms từ `RoomDetection.findRooms()` (có `nodes[]` theo thứ tự perimeter) để suy `wallIds` + `centroid` (polygon centroid) + `bbox`.
3. **Transaction ở tầng AgentClient** (1 `asyncTransaction` bọc CẢ lượt AI), KHÔNG ở dispatchBridge → undo 1 phát xoá sạch cả lượt kể cả nhiều tool-call (nền WP6). Dùng `asyncTransaction` thay `withTransaction` vì `PLACE_FURNITURE` async (undo-safe).
4. **Guard chống hallucinate (`assertKnownModel`) làm sớm từ WP1** thay vì đợi WP2 — rẻ, reject modelId bịa trước dispatcher, trả lỗi dạng tool_result để LLM tự sửa.
5. **Wire FE↔BE TRUNG LẬP + backend stateless proxy** (không có trong plan) — provider bị cô lập hoàn toàn trong backend; `parseTurn`/`toTurn` tách thuần để test không cần network.
6. **Auth tạm thời:** `/ai/chat` chưa gắn `requireAuth` (FE chưa có Supabase token) → route **refuse khi `NODE_ENV=production`** chống open-relay. Phải thay bằng `requireAuth` khi FE có auth.
7. **⚠️ `PLACE_FURNITURE` KHÔNG check va chạm** (verify `handlers/furnitureHandlers.ts:49-54`: `handlePlaceFurniture` chỉ gọi `spawnFurnitureGLB` → spawn ngay, **không có cổng collision**). Collision **chỉ** enforce trên thao tác **tương tác** MOVE/ROTATE (`CannonCollisionSystem.wouldCollideCustom`). → **Bất biến "collision kế thừa miễn phí" là SAI với furniture đặt mới.** Hệ quả sống còn cho WP4: **solver là người DUY NHẤT đảm bảo không-chồng**; test WP4 phải assert trực tiếp bằng AABB, **không** trông vào "dispatcher reject". (`PLACE_WALL_ITEM` thì CÓ guard chồng-opening — khác furniture sàn.)

### File đã tạo
- **FE:** `src/ai/perception/describeScene.ts`; `src/ai/agent/{agentTypes,toolRegistry,AgentClient,systemPrompt,createAgentRunner}.ts`; `src/ai/tools/{dispatchBridge,placeFurniture}.ts`; `src/ai/transport/backendTransport.ts`; `src/ai/catalog/catalogSummary.ts` (+ 4 file `.test.ts`). Ráp vào `src/app/components/editor/overlays/AIChatbot.tsx`.
- **BE:** `02-backend/domains/ai/{ai.routes,ai.service,ai.schema,ai.types}.ts`; env `GEMINI_API_KEY` / `GEMINI_MODEL`; router đăng ký ở `app.ts`.

---

## 🚦 Decision gate (chốt TRƯỚC khi vào WP1)

**§5 — AI loop chạy ở đâu?** → ✅ **ĐÃ CHỐT 5a** (loop ở `02-backend`, key server-only). Backend thực tế là **stateless proxy** giữ key; FE giữ vòng lặp + history qua `BackendTransport` (wire trung lập). Bất biến quan trọng nhất đã đạt: API key (Gemini) không bao giờ vào client bundle.

- **WP0 KHÔNG bị chặn** bởi quyết định này — `describeScene` là pure function read-only, build trước được ngay.
- Quyết định chỉ "cắn" từ WP1 (agent loop đầu tiên). Xem câu hỏi cuối turn.

---

## WP0 — Perception: `describeScene()` (lớp "mắt") — ✅ DONE

**Goal:** Biến scene hiện tại thành JSON gọn cho LLM đọc. Read-only, zero risk, không phụ thuộc §5.

> ✅ **Đã làm.** Lưu ý 2 sai khác so với mô tả dưới: (1) đọc thẳng ECS (giữ `entityId`), KHÔNG qua `serializeScene`; (2) `RoomGeometry.key` = nodeIds chứ không phải wallIds → dùng `RoomDetection.findRooms()`. Xem mục "Sai khác" ở đầu file.

- **Tạo:** `src/ai/perception/describeScene.ts`
- **Binds to:** `serializeScene(engine)` → `SceneDocument`; cộng `RoomGeometry` (từ `world`, do `RoomSystem` tạo) để có **danh sách phòng + diện tích + tâm phòng** (LLM cần room context mà `SceneDocument` raw không có).
- **Output shape (đề xuất):**
  ```ts
  type SceneSummary = {
    rooms: { key: string; area: number; centroid: {x,z}; bbox: {...}; wallIds: string[] }[];
    walls: { wallId: string; from:{x,z}; to:{x,z}; length: number; thickness: number }[];
    furniture: { entityId: string; modelId: string; name: string; x; z; rotY }[];
    wallItems: { entityId: string; modelId: string; hostWallId: string; t; side }[];
    empty: boolean;
  };
  ```
- **Done-when:** Unit test: dựng scene 1 phòng + 1 sofa → `describeScene()` trả đúng 1 room (area khớp), 4 walls, 1 furniture. JSON < ~2KB cho phòng điển hình.

---

## WP1 — Agent loop skeleton + 1 lệnh đơn (chứng minh trục dispatch) — ✅ DONE

**Goal:** "thêm cửa ở đây" / "đặt cái sofa" → 1 macro → 1–2 `EngineCommand` chạy qua dispatcher. Phase 1 của doc §6.

> ✅ **Đã làm**, chẻ thành **WP1a** (FE agent core, test headless) + **WP1b** (kênh 5a backend + Gemini + ráp `AIChatbot`). Provider = **Gemini** (không phải Anthropic). Tool đầu tiên đã làm = `placeFurniture` (`addOpening` để WP3). Wire FE↔BE trung lập; transaction ở tầng AgentClient. Verify live: route + validate + key guard thông suốt.

- **Phụ thuộc:** Decision gate §5.
- **Tạo (frontend):**
  - `src/ai/agent/AgentClient.ts` — vòng lặp tool-use (qua seam `LlmTransport`; provider thật = Gemini, sống ở backend).
  - `src/ai/agent/toolRegistry.ts` — đăng ký tool schema + handler.
  - `src/ai/tools/dispatchBridge.ts` — nhận `EngineCommand[]` từ tool, chạy `useEngineApi.dispatchAsync` trong `withTransaction("ai: <label>")`.
- **Tạo (backend, nếu 5a):** `02-backend/.../ai/route` — giữ `ANTHROPIC_API_KEY`, chạy loop, stream tool-call về FE; FE expand + dispatch.
- **Tool đầu tiên:** `addOpening({ wallRef, kind, position })` → `PLACE_WALL_ITEM`; `placeFurniture` tối giản (chưa solver, dùng toạ độ phòng) → `PLACE_FURNITURE`.
- **Done-when:** Gõ chat "đặt sofa giữa phòng" → entity xuất hiện trên canvas, **undo 1 phát xoá sạch** (nhờ `withTransaction`). API key không có ở client bundle.

---

## WP2 — Catalog retrieval: `searchCatalog()` (chống hallucinate modelId) — ✅ DONE

**Goal:** AI **chỉ** chọn modelId có thật. Doc §7.3.

> ✅ **Đã làm.** Hàm thuần `src/ai/catalog/searchCatalog.ts` (fuzzy token trên `name+category`, lọc constraint floor) + tool `src/ai/tools/searchCatalog.ts`. **Thay catalog tĩnh nhúng prompt** bằng tool search on-demand + danh sách category → prompt gọn, scale theo catalog. Tên catalog tiếng Anh → system prompt dạy model dịch ý định tiếng Việt sang từ khoá Anh ("đặt giường" → `searchCatalog("bed")`). Guard `assertKnownModel` (WP1) vẫn là lưới an toàn cuối. 8 unit test.

- **Tạo:** `src/ai/catalog/searchCatalog.ts`
- **Binds to:** `catalogMap` / `getCatalogItem` trong `FurnitureCatalog.ts`; đọc `category`, `name`, `boundingBox` từ `objects.json`.
- **API:** `searchCatalog(query, { category?, maxResults }) → { modelId, name, category, footprint }[]`. Khớp theo category + fuzzy name. **Không** trả model ngoài catalog.
- **Done-when:** `searchCatalog("ghế sofa")` chỉ trả id tồn tại trong `objects.json`; validate guard: dispatch bridge **reject** modelId không có trong `catalogMap` trước khi xuống dispatcher. *(Guard `assertKnownModel` đã làm sớm ở WP1; WP2 còn lại phần search/rerank + thay catalog tĩnh đang nhúng trong system prompt.)*
- **Mở rộng (sau WP-DATA):** thêm filter `{ style?, tone? }` đọc tag mới → AI lọc đồ đúng style ("sofa Scandinavian"). **Chưa làm** — WP2 hiện chỉ `category` + fuzzy name.

---

## WP3 — Bộ macro tools đầy đủ (Cấp A, doc §4) — ✅ 3/5 (cấu trúc)

**Goal:** Hoàn thiện 6 macro tools, mỗi cái expand deterministic thành `EngineCommand[]`.

> ✅ **Đã làm 3 macro cấu trúc** (không phụ thuộc subsystem khác): `createRoom` (4×ENSURE_NODE + 4×ADD_WALL, RoomDetection thấy 1 phòng kín), `addOpening` (PLACE_WALL_ITEM, guard constraint wall + check tường tồn tại), `resizeRoom` (MOVE_NODES, đọc phòng qua RoomDetection, chỉ phòng chữ nhật trục XZ). Thêm guard `assertConstraint(floor/wall)` + param `kind` cho searchCatalog. `placeFurniture` đã có (WP1). **Còn:** `furnishRoom` → WP4 (cần solver), `setSurfaceMaterial` → WP7 (cần material grounding qua materials.json). 9 integration test (dùng dispatcher thật qua `engineHarness`).

- **Tạo:** `src/ai/tools/{createRoom,addOpening,placeFurniture,furnishRoom,setSurfaceMaterial,resizeRoom}.ts`
- **Mapping (đã verify command tồn tại):**
  | Macro | Expand thành |
  |---|---|
  | `createRoom` | 4× `ENSURE_NODE` (id từ `nextNodeId()`) + 4× `ADD_WALL` (id từ `nextWallId()`) — 1 transaction |
  | `addOpening` | `PLACE_WALL_ITEM` (modelId, `t`, `side`) |
  | `placeFurniture` | solver(WP4) → `PLACE_FURNITURE` (x, z, rotY) |
  | `furnishRoom` | nhiều `PLACE_FURNITURE` qua solver |
  | `setSurfaceMaterial` | `SET_WALL_MATERIAL` / `SET_FLOOR_MATERIAL` / `APPLY_FURNITURE_MATERIAL` |
  | `resizeRoom` | `MOVE_NODES` (atomic, giữ item bám tường đứng yên) |
- **Quy ước:** mỗi macro kết thúc bằng `describeScene()` trả về agent → agent thấy kết quả thật (kể cả khi dispatcher từ chối va chạm) → tự sửa.
- **Done-when:** Integration test mỗi macro: gọi → assert đúng chuỗi command + scene sau cùng. `createRoom` tạo phòng kín (RoomSystem detect ra 1 room).

---

## WP4 — Layout solver (Cấp B, CODE — ranh giới sống còn, doc §4) — 📐 SPEC CHI TIẾT, chưa code

**Goal:** AI quyết *ý định* ("giường áp tường bắc, chừa lối đi 0.7m"); **code tính toạ độ**. Đây là **lõi giá trị** + **test khó nhất** → spec hoá kỹ trước khi code.

### 0. Ranh giới trách nhiệm (đọc trước)
- **AI (LLM) quyết:** *chọn món nào* (`modelId` qua `searchCatalog`), *ý định bố cục* (`against: "north-wall"`, `clearance: 0.7`, `facing: "into-room"`), *thứ tự ưu tiên*. **KHÔNG** sinh toạ độ thô.
- **CODE (solver) quyết:** `{x, z, rotY}` cụ thể sao cho **không chồng**, **trong phòng**, **chừa lối đi**.
- **⚠️ Bất biến đã sửa (Sai khác #7):** `PLACE_FURNITURE` **không** check va chạm → **solver là người DUY NHẤT** chống chồng. Không có lưới an toàn ở engine.

### 1. Module
```
src/ai/solver/
  layoutSolver.ts   # solvePlacement (1 món) + solveLayout (nhiều món, greedy)
  anchors.ts        # giải named anchor → toạ độ/hướng từ room geometry
  rect.ts           # AABB: footprintRect, inflate, overlaps, insideRoom (thuần, test riêng)
  types.ts          # SolverRoom, PlacementIntent, Placement, LayoutResult
```
Tất cả **pure** (input room geometry + catalog getter, output toạ độ) — **không** chạm ECS/dispatch. Tool `placeFurniture`/`furnishRoom` gọi solver rồi mới `dispatchCommands`.

### 2. Kiểu dữ liệu (grounded vào API thật)
```ts
// Lấy từ describeScene().rooms[i] — KHÔNG query lại engine trong solver.
type SolverRoom = {
  bbox: { minX: number; minZ: number; maxX: number; maxZ: number }; // RoomSummary.bbox
  points: { x: number; z: number }[];   // perimeter order (RoomDetection.findRooms .points)
  centroid: { x: number; z: number };   // RoomSummary.centroid
  wallThickness: number;                // max thickness tường bao (từ WallSummary.thickness)
};
type Obstacle = { rect: Rect; kind: "furniture" | "opening-clearance" }; // đã chiếm chỗ
type PlacementIntent = {
  modelId: string;
  against?: Anchor;          // "north-wall"|"south-wall"|"east-wall"|"west-wall"|"center"|"corner-ne"|...
  clearance?: number;        // lối đi tối thiểu quanh món (m), default 0.6
  facing?: "into-room" | "to-wall" | number; // number = rotY radian tường minh
  align?: number;            // vị trí dọc tường 0..1 (default 0.5 = giữa cạnh)
};
type Placement = { modelId: string; x: number; z: number; rotY: number };
type LayoutResult = {
  placed: Placement[];
  skipped: { modelId: string; reason: string }[]; // trả về agent → agent tự xử (bỏ/hỏi)
};
```
> **Footprint** lấy từ `getFootprint2D(modelId) → {width, depth}` (đã có chuỗi fallback, luôn dùng được). **Constraint** lấy từ `getPlacement(modelId).constraint`: solver **chỉ** xử `"floor"`; `"wall"` thuộc `addOpening`/wall-mount, **reject** ở solver nếu lọt vào.

### 3. Quy ước hệ toạ độ — **PHẢI calibrate trước khi code** (2 ẩn số thật)
1. **rotY=0 quay về hướng nào?** Phụ thuộc trục forward của GLB — **chưa biết, không đoán.** *Bước calibrate:* đặt 1 sofa `rotY=0`, quan sát trong 3D, ghi lại "mặt trước = +Z hay −Z". Viết hằng `FORWARD_AXIS` + comment. Mọi `facing` suy từ đó.
2. **north/south/east/west ↔ XZ?** Chốt convention (tuỳ ý nhưng nhất quán + ghi rõ): `north = minZ`, `south = maxZ`, `west = minX`, `east = maxX`. "Áp tường bắc" = sát cạnh `minZ`, mặt quay vào phòng (+Z).
> Hai ẩn số này là **rủi ro #1 của WP4** — sai là toàn bộ đặt sai hướng. Calibrate (10 phút thủ công) **trước** khi viết `anchors.ts`.

### 4. Thuật toán
**`solvePlacement(room, intent)` — 1 món:**
1. `fp = getFootprint2D(modelId)`. Nếu `against` xoay 90° (đông/tây tường) → hoán đổi `width↔depth` cho AABB.
2. Giải anchor → vị trí neo + rotY (anchors.ts). Ví dụ `north-wall`: `z = minZ + wallThickness/2 + fp.depth/2`; `x = lerp(minX', maxX', align)` (với `minX'/maxX'` đã inset nửa bề dày tường + nửa footprint để không lú ra ngoài); `rotY` = quay mặt vào +Z.
3. Trả `{x, z, rotY}`. (1 món **không** cần tránh chồng — đó là việc của `solveLayout`.)

**`solveLayout(room, intents[], existingObstacles[])` — nhiều món (greedy):**
1. **Khởi tạo obstacles** = furniture đã có (`describeScene().furniture` → rect) + **clearance trước mỗi opening** (`wallItems[kind=opening]` → rect rộng = doorWidth, sâu = 0.9m vào phòng) → KHÔNG đặt chặn cửa.
2. **Sắp ưu tiên:** món "neo cứng" (bed/sofa/wardrobe — có `against` rõ) đặt trước; món phụ (nightstand/coffee-table) sau.
3. Mỗi món:
   a. Lấy vị trí lý tưởng từ `solvePlacement`.
   b. `rect = inflate(footprintRect(placement), clearance/2)`.
   c. **Nếu** `overlaps(rect, anyObstacle)` **hoặc** `!insideRoom(rect, room)` → **trượt tìm**: quét dọc tường mục tiêu theo bước `0.1m` (rồi fallback quét lưới toàn phòng), lấy vị trí hợp lệ đầu tiên.
   d. Không tìm được → đẩy vào `skipped` (lý do: "hết chỗ tránh chồng/lối đi") — **không** đặt liều.
   e. Thành công → push placement + thêm rect vào obstacles.
4. Trả `LayoutResult`. Tool đẩy `placed[]` thành `PLACE_FURNITURE[]`; trả `skipped[]` cho agent.

**Giới hạn M1 có chủ đích (ghi rõ, như resizeRoom):**
- Chỉ **xoay bội số 90°** → AABB chính xác (xoay tự do làm footprint AABB phình sai). Đủ cho bố cục áp tường.
- Phòng **lồi (convex)**; phòng lõm → vẫn chạy nhưng chỉ đảm bảo trong `bbox` (ghi cảnh báo, không bảo đảm tối ưu).

### 5. AABB overlap — dùng chung ngữ nghĩa với engine
`rect.ts` tự viết (thuần) NHƯNG **đối chiếu** với adapter engine `src/engine/adapters/furnitureBoxes.ts` (`collectFurnitureBoxes`) để overlap-test của solver **khớp** cách engine hiểu box va chạm → tránh "solver bảo OK mà move tay lại báo chồng". Test WP4 dùng chính AABB này để verify (không có dispatcher reject để dựa — xem Sai khác #7).

### 6. API công khai
```ts
solvePlacement(room: SolverRoom, intent: PlacementIntent): Placement;
solveLayout(room: SolverRoom, intents: PlacementIntent[], existing?: Obstacle[]): LayoutResult;
```
`placeFurniture` (đã có, WP1) nâng cấp: thêm chế độ nhận `intent` thay toạ độ thô → gọi `solvePlacement`. `furnishRoom` (WP3 còn nợ) = `solveLayout` → nhiều `PLACE_FURNITURE`.

### 7. Done-when (đo được, nối thẳng eval harness §WP4-EVAL)
- 5 scenario vàng pass (xem §WP4-EVAL), gồm case khó: "giường + 2 tủ đầu giường áp tường bắc, lối đi ≥0.7m".
- **Assert trực tiếp** (KHÔNG dùng dispatcher reject): (a) `assertNoOverlap` mọi cặp box (clearance tính vào); (b) `assertInsideRoom` mọi box ⊂ phòng; (c) `assertWalkway ≥ 0.7m` ở trục chính; (d) cửa không bị chặn.
- Solver thuần → test **không cần engine/LLM**, chạy nhanh trong CI.

---

## WP4-EVAL — Eval harness không-gian (làm CÙNG WP4, là cổng nghiệm thu)

**Goal:** Biến "bố cục đúng" thành thứ **đo được & regression-test được**. Thiếu cái này, WP4 không biết khi nào *xong*. Tách 2 tầng rõ:

### Tầng A — Deterministic (chặn CI, cho solver)
- **Tạo:** `src/ai/eval/spatialAssertions.ts` (`assertNoOverlap`, `assertInsideRoom`, `assertWalkway`, `assertDoorClear`) + `src/ai/eval/scenes/*.ts` (fixtures phòng vàng, tái dùng `buildEngineHarness` + `describeScene`).
- **Corpus tối thiểu (5):** ① phòng ngủ 3×4 — giường đôi áp bắc + 2 nightstand; ② phòng khách 4×5 — sofa + bàn trà + kệ TV đối diện, chừa lối; ③ phòng nhỏ 2.5×3 (stress: ít chỗ → buộc `skipped`); ④ phòng có 1 cửa + 1 cửa sổ (test clearance cửa); ⑤ phòng chữ L / lõm (test fallback bbox + cảnh báo).
- **Done-when:** cả 5 pass assertion A; thêm 1 fixture mới chỉ là thêm 1 file scene + kỳ vọng.

### Tầng B — LLM-as-judge (KHÔNG chặn CI, cho style ở WP5/WP7)
- "Có đúng Scandinavian/đủ thoáng không" là **chủ quan, code không verify được** (đã ghi ở §Style grounding). → rubric chấm bằng LLM-judge, chạy **thủ công/định kỳ**, không nhồi vào unit test.
- **Tạo (sau WP-DATA):** `src/ai/eval/styleRubric.md` + script chấm điểm; output = bảng điểm/đề xuất, không phải pass/fail cứng.

> **Vì sao tách:** trộn "không chồng" (test cứng) với "đẹp/đúng style" (chủ quan) vào một gate sẽ làm CI giòn hoặc làm style bị bỏ. A đo hình học, B đo thẩm mỹ.

---

## WP-DATA — Style/tone tagging (điều kiện cần cho style) — ⏳ chưa làm

**Goal:** Catalog & material có metadata để `searchCatalog` lọc theo style/tone và để skill tham chiếu palette. **Không có bước này, mọi việc về style ở WP5/WP7 vô nghĩa** — AI chỉ đoán style qua tên món.

**Hiện trạng (khảo sát 2026-06-16):** `objects.json` **107 món** / `materials.json` **63 material** — **0 tag**. Material chỉ có `category` (wood/fabric…), **không có tone** (sáng/tối) → palette-matching bất khả thi. Tone là tag **quan trọng nhất** (Scandinavian phân biệt chính bằng gỗ sáng vs tối).

- **Material — thêm `tone` (bắt buộc) + `style` (tùy chọn):**
  ```json
  { "id": "WoodFloor070", "category": "woodfloor", "tone": "light", "style": ["scandinavian","modern"] }
  ```
  `tone`: `light | medium | dark | neutral | warm | cool`. Phần lớn suy máy từ category; chỉ wood/woodfloor/fabric/stone (~26 món) chấm tay sáng/tối từ `icon`.
- **Object — thêm `style` + `traits`:**
  ```json
  { "id": "sofa-low-01", "category": "sofas", "style": ["scandinavian","minimalist","modern"], "traits": ["low-profile","clean-line"] }
  ```
  **Bán tự động:** feed `thumbnailUrl` (có sẵn mọi món) cho LLM-vision chấm tag → người review. Không gõ tay 107 lần.
- **Done-when:** mọi material có `tone`; mọi object có `style` (≥1) + `traits`; `searchCatalog` lọc `{ style, tone }` trả đúng tập con. ~1–1.5 ngày, làm 1 lần.
- **Thứ tự nội bộ:** `tone` material (rẻ, suy máy phần lớn) → `style/traits` object (bán tự động) → nâng `searchCatalog` (WP2 mở rộng) → viết style skill (WP5).

> **Lưu ý mojibake:** objects.json/materials.json không có comment tiếng Việt, nhưng nếu sửa bằng PowerShell vẫn giữ encoding UTF-8 khi ghi.

---

## WP5 — Skills (progressive disclosure, doc §2)

**Goal:** Tách kiến thức thiết kế khỏi system prompt; nạp on-demand.

- **Tạo:** `src/ai/skills/{furnish-bedroom,furnish-living-room,furnish-kitchen,lighting-design,small-space-optimization,traffic-flow,material-pairing}.md`
- **Style skills (mới, cần WP-DATA):** `src/ai/skills/style-{scandinavian,modern,minimalist}.md` — mỗi file dịch style → **luật cụ thể máy dùng được**: palette (`tone`/material nào dùng / tránh), đặc tính đồ (`traits`/`style` ưu tiên), **mật độ** (≤ N món chính, chừa ≥ X% sàn trống), ánh sáng (nhiệt màu). Tham chiếu tag từ WP-DATA — không nhồi toạ độ.
- **Cơ chế (raw API):** system prompt giữ *mô tả ngắn* mỗi skill + tool `read_skill(name)` đọc full nội dung khi task cần (doc §2 "Lưu ý surface").
- **Done-when:** "làm phòng ngủ 2 người" → agent gọi `read_skill("furnish-bedroom")` đúng lúc; token system prompt cố định không phình theo số skill.

---

## WP6 — Room planner: cả nhà từ brief (Phase 3, doc §6)

**Goal:** "căn 2 phòng ngủ 60m², bếp mở" → nhiều `createRoom` + `furnishRoom` + skills.

- **Tạo:** `src/ai/planner/housePlanner.ts` — chia diện tích → lưới phòng → gọi macro theo thứ tự.
- **Guardrail (doc §7.5):** **preview + confirm** trước thao tác lớn ("tôi sẽ dựng 3 phòng, OK?"); cả cụm bọc trong 1 `withTransaction` → undo nguyên căn.
- **Phạm vi M1:** chỉ **1 tầng** (xem §Phạm vi M1). Multi-floor là milestone riêng — cần engine có khái niệm storey trước, không giải ở đây.
- **Done-when:** 1 brief (1 tầng, 3–4 phòng) → cả tầng dựng + furnish, undo 1 phát sạch, không phòng nào chồng.

---

## WP7 — Tinh chỉnh lặp + material (Phase 4, doc §6)

**Goal:** "phòng khách rộng hơn", "đổi sofa xám".

- **Binds to:** `MOVE_NODES` (resize), `APPLY_FURNITURE_MATERIAL` / `SET_WALL_MATERIAL` / `SET_FLOOR_MATERIAL`. Liên kết plan **Material Sidebar** đang có.
- **Style-aware material (cần WP-DATA):** "đổi sang tông sáng Scandinavian" → lọc material theo `tone`/`style` thay vì chỉ `category`. Không có tag thì chỉ đổi được theo category mù.
- **Done-when:** Lệnh chỉnh sửa tham chiếu entity từ `describeScene` (không bịa id), áp đúng.

---

## Cross-cutting (làm song song, không phải phase riêng)

- **Guardrails:** validate mọi `modelId`/`materialId` qua `catalogMap`/`materials.json` TRƯỚC dispatch; giới hạn số bước loop (chống không hội tụ); fallback "cần làm rõ…".
- **Telemetry:** log mỗi tool-call + command emit để debug spatial reasoning.
- **Test harness:** scene fixtures tái dùng cho WP0/WP3/WP4 (`buildEngineHarness` headless + `describeScene`).
- **Model routing:** ~~Anthropic~~ → **Gemini** (đổi 2026-06-12). Mặc định `gemini-2.5-flash` (env `GEMINI_MODEL`); task khó/planner → `gemini-2.5-pro`; bước rẻ giữ `flash` / `gemini-2.5-flash-lite`.

---

## 🧾 Nợ kỹ thuật cần theo dõi (không cản build, PHẢI trả trước khi ship)

| # | Nợ | Nguồn | Khi nào phải trả |
|---|---|---|---|
| TD-1 | `/ai/chat` chưa có `requireAuth` (chỉ refuse khi `NODE_ENV=production`) | Sai khác #6 | **Trước production** — thay bằng `requireAuth` ngay khi FE có Supabase token. Open-relay risk. |
| TD-2 | `PLACE_FURNITURE` không check collision — solver gánh hết | Sai khác #7 | Bám chặt khi làm WP4; nếu sau này có lệnh đặt furniture **ngoài** solver (vd import) → phải tự kiểm chồng. |
| TD-3 | `describeScene` đọc thẳng ECS, KHÔNG qua `serializeScene` → 2 đường perception dễ phân kỳ | Sai khác #1 | Thêm 1 test khoá shape (`SceneSummary` vs entity thật) để bắt drift khi ECS đổi component. |
| TD-4 | Loop chưa có cap số bước cứng (chống không hội tụ) | Cross-cutting/Guardrails | Trước WP6 (planner gọi nhiều tool) — đặt max-steps + fallback "cần làm rõ". |
| TD-5 | rotY=0 forward-axis & convention N/S/E/W **chưa calibrate** | WP4 §3 | **Trước khi viết `anchors.ts`** — 10 phút thủ công, ghi hằng số + comment. |

---

## Thứ tự thi công đề xuất

```
WP0 (mắt, không chặn) ──► WP2 (catalog) ──┐
                                          ├──► WP3 (macro) ──► WP4 (solver) + WP4-EVAL ◄── khó nhất, làm cùng nhau
WP1 (loop + 1 lệnh, cần §5) ──────────────┘                         │
                                          (calibrate TD-5 trước)     ▼
WP-DATA (tag style/tone) ───────────────► WP5 (style skills) ─► WP6 (1 tầng) ─► WP7 (tinh chỉnh)
```

> **WP-DATA** chạy song song được ngay (không chặn bởi WP4) — chỉ là gán tag data. Hoàn thành trước khi vào WP5/WP7 thì style mới có nghĩa.
> **WP4 + WP4-EVAL đi đôi:** viết assertion (Tầng A) song song solver — eval là cổng nghiệm thu, không phải bước sau.

**Mốc nhìn thấy kết quả (~1 tuần):** WP0 + WP1 → chat điều khiển được scene, validate toàn trục kỹ thuật gồm §5.
**Lõi giá trị:** WP4 (solver) — quyết định chất lượng sản phẩm.
