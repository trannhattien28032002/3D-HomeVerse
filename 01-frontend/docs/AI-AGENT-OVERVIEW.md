# AI Agent — Tổng quan cơ chế hoạt động

> Tài liệu đọc-hiểu cho AI agent điều khiển scene bằng chat trong HomeVerse. Mô tả luồng
> end-to-end, từng tầng, và pipeline "brief → cả nhà". Chi tiết thi công ở
> `docs/AI-AGENT-BUILD-PLAN.md` (WP0–WP7) và `AI-HOME-GENERATION-PLAN.md` (home-gen + M1.5).
> Cập nhật: 2026-06-22.

---

## 1. Triết lý cốt lõi

**AI chỉ "dịch ngôn ngữ → ý định", KHÔNG bao giờ chạm toạ độ thô / ECS / Three.js.** Nó chỉ được
phép **gọi tool**. Mọi thay đổi scene đi qua `EngineCommand` → dispatcher → ECS — đúng đường mà
thao tác tay của người dùng đi qua.

Hệ quả:
- AI không thể tạo state sai — nó chỉ có N tool, mỗi tool tự validate (cấm bịa id).
- Lớp **tất định** (tool handler + solver) chịu trách nhiệm "đặt đúng chỗ / không chồng"; **LLM**
  chịu trách nhiệm "hiểu người dùng muốn gì".
- Đổi LLM provider không đụng phần còn lại (wire trung lập).

---

## 2. Luồng end-to-end (1 lượt chat)

```
Người dùng gõ: "tạo căn hộ 2 phòng ngủ phong cách scandinavian"
   │
   ▼  [AIChatbot.tsx]  tạo runner mỗi lượt, truyền { api, perception }
[createAgentRunner]  ráp: describeScene + ToolRegistry(9 tool) + BackendTransport + systemPrompt
   │
   ▼  [runAgent — AgentClient.ts]  MỞ 1 asyncTransaction (bọc cả lượt → undo 1 phát)
   │      ├─ describeScene(perception): chụp scene hiện tại thành JSON gọn (~2KB)
   │      ▼
   │   [BackendTransport.start]  POST /ai/chat { system, tools, turns:[scene + yêu cầu] }
   │      ▼
   │   [Backend ai.service.runChat]  dịch turns trung lập → Gemini → generateContent
   │                                  → chuẩn hoá { text, toolCalls, finishReason }
   │      ▼
   │   LLM: "gọi generateHouse({brief})"   (finishReason = "tool_use")
   │      ▼
   │   [runAgent loop]  registry.execute(call) → tool.handler → EngineCommand[] → dispatch → ECS đổi
   │      → trả JSON kết quả THẬT (ok / notes / placed…) cho LLM
   │      ▼
   │   transport.next(results) → POST lại cả history → LLM xem kết quả
   │      ▼
   │   LLM: "Đã dựng xong căn hộ…"   (finishReason = "stop" → final)
   │
   ▼  đóng asyncTransaction → push undo history
finalText hiện lên khung chat
```

Vòng lặp dừng khi LLM trả `final` HOẶC chạm trần `DEFAULT_MAX_STEPS = 8` (chống loop không hội tụ).

---

## 3. Từng tầng

### a) "Mắt" — `src/ai/perception/describeScene.ts`
Đọc thẳng ECS world ra JSON gọn, ổn định cho LLM:
- `rooms[]`: `key` (= sorted nodeIds), `area`, `centroid`, `bbox`, `wallIds`, **`type`** (living/bedroom/…
  nếu đã gán — xem §6).
- `walls[]`: `wallId`, `from`, `to`, `length`, `thickness`.
- `furniture[]`: `entityId` (để tham chiếu món sau), `modelId`, `x/z/rotY`.
- `wallItems[]`: cửa/cửa sổ/kệ (hostWallId, t, side).

Chạy mỗi lượt → AI luôn thấy scene mới nhất. **Không dùng `serializeScene`** (format file mất entityId).

### b) Bộ não — Gemini (ở `02-backend/domains/ai`)
- Key `GEMINI_API_KEY` chỉ sống server-side, KHÔNG vào bundle client.
- FE gửi *wire trung lập* (`turns`: user/assistant/tool); backend (`ai.service.ts`) dịch sang Gemini
  `contents` (functionCall/functionResponse) và chuẩn hoá ngược → `{ text, toolCalls, finishReason }`.
- Tool schema truyền qua `parametersJsonSchema` (raw JSON Schema). Có retry/backoff cho lỗi 429/5xx.
- **Đổi provider** (Gemini↔Anthropic↔…) chỉ sửa `ai.service.ts`, không đụng FE.

### c) Vòng lặp — `src/ai/agent/AgentClient.ts` (`runAgent`)
`start` → khi LLM còn `tool_use`: chạy tool → nộp kết quả → lặp → đến `final`/max-steps.
Toàn bộ lượt bọc trong **1 `asyncTransaction`** → dù AI gọi nhiều tool, người dùng **undo 1 phát**.

### d) Tool — `src/ai/tools/*` + `dispatchBridge.ts`
9 tool: `searchCatalog, createRoom, placeFurniture, addOpening, resizeRoom, furnishRoom,
setSurfaceMaterial, generateHouse, read_skill`. Mỗi tool = `schema` (cho LLM) + `handler`
(ý định → `EngineCommand[]` → dispatch). Handler guard chặt: id sai → ném lỗi trả về LLM để tự sửa.

### e) Prompt + skills — `systemPrompt.ts`, `src/ai/skills/*.md`
- `systemPrompt`: persona kiến trúc sư + luật khi nào gọi tool + danh mục category/skills. Phần TĨNH
  (cache tốt); scene ĐỘNG đẩy ở message người dùng (không phá cache prefix).
- `read_skill(name)`: nạp on-demand hướng dẫn thiết kế chi tiết (furnish-bedroom, style-scandinavian…).

---

## 4. Bất biến quan trọng

| Bất biến | Lý do |
|---|---|
| AI chỉ gọi tool, không chạm toạ độ | Không tạo state sai; mọi mutation qua dispatcher đã validate |
| 1 lượt = 1 transaction | Undo 1 phát, sạch |
| Key ở backend | Không lộ API key trong client |
| ⚠️ `PLACE_FURNITURE` KHÔNG check va chạm ở engine | → **solver (`furnishRoom`) là lưới an toàn DUY NHẤT** chống chồng |
| Transport stateless-per-message | Mỗi tin nhắn là hội thoại mới → `generateHouse` mặc định **dựng ngay** (không chờ confirm 2-bước) |

---

## 5. `generateHouse` — pipeline "brief → cả nhà"

```
brief { style, rooms:[{type,count,areaM2?}], footprint? }
  │
  ▼ planHouse()        slice-and-dice treemap: chia footprint → lưới phòng chữ nhật (type + rect)
  ▼ createRoom × N     dựng tường mỗi phòng (tự GỘP node + CHẺ tường khi phòng kề nhau)
  ▼ [1b] re-perceive   map phòng-detected → plan theo CENTROID → lấy roomKey THẬT  ★
  ▼ [1c] SET_ROOM_TYPE  gán type mỗi phòng → describeScene phơi `rooms[].type`      ★ (§6)
  ▼ addOpening         cửa giữa phòng kề + cửa chính (lưu doorWallIds)
  ▼ setSurfaceMaterial  palette sàn/tường theo StylePack[style]
  ▼ furnishRoom        recipeToIntents(style,type) → solveLayout → PLACE_FURNITURE
                       + đồ treo thật (towel-holder…) → addOpening
```
★ Bước 1b sửa bug ngầm: roomKey 4-góc lệch khi phòng kề chẻ tường → trước đây `furnishRoom` tra
trượt → **0 đồ**. Giờ map theo centroid → key khớp → đặt được đồ.

### Lớp bày đồ — `src/ai/style/recipeToIntents.ts` + `src/ai/solver/`
- **Recipe** (`data/room-recipes-curated.json`): mỗi loại phòng = danh sách *vai trò đồ* + *ý định đặt*.
- **`recipeToIntents`**: chọn modelId thật theo tag style; dịch vocab recipe → `PlacementIntent`:
  - `against: wall/center/corner` → neo tuyệt đối.
  - `around:<role>` → vây 4 cạnh món tham chiếu (ghế quanh bàn).
  - `anchorTo:<role>` → đặt ngay trước mặt ref (bàn trà trước sofa, ghế sát desk).
  - `wall-opposite:<role>` → tường đối diện món chính (TV đối diện sofa).
  - `underlay` → thảm (lớp dưới đồ).
  - `mounted` (đồ treo thật) → trả riêng để `generateHouse` gọi `addOpening`.
- **`solveLayout`**: nhận ý định → tính toạ độ thật. 2 pha (neo tuyệt đối trước, tương đối sau),
  greedy, đảm bảo **không chồng / trong phòng / chừa lối / né cửa**. Hết chỗ → `skipped` (không đặt liều).

---

## 6. Cập nhật M1.5 (2026-06-22) — chất lượng generate

Hai defect được sửa (chi tiết `AI-HOME-GENERATION-PLAN.md §8`):

**Plan A — danh tính phòng.** Phòng giờ có `type` BỀN: `roomTypes: Map<roomKey→type>` trong engine,
serialize vào file (`SceneDocument.roomTypes`), phơi ra `describeScene().rooms[].type`. Sống qua
save/undo/redo. Lệnh mới `SET_ROOM_TYPE` (mirror cơ chế `SET_FLOOR_MATERIAL`). → Lượt chat sau AI hiểu
"phòng ngủ" là phòng nào; UI có thể hiện nhãn.

**Plan B — bố cục có chủ đích.** Trước đây đồ bày "lung tung" vì recipe→intent ở mức M1 rút gọn +
solver grid-scan làm món áp tường trôi. Đã sửa:
- **B4**: solver bỏ grid-scan toàn phòng cho món áp tường (chỉ trượt dọc tường → kẹt thì skip, không
  trôi ra giữa); `furnishRoom` coi cửa là obstacle → đồ né cửa.
- **B2/B1**: neo tương đối (`anchorTo` "front" + "around") → bàn trà trước sofa, ghế vây quanh bàn.
- **B3**: thảm = lớp `underlay` (nằm dưới đồ); TV đứng sàn đối diện sofa; đồ treo thật route addOpening.

Còn defer (ghi trong plan §8.5): B5 chặt (đổi hẳn tường cho đầu giường), `created[].wallIds` lệch khi
chẻ tường, UI nhãn phòng, multi-floor.

---

## 7. Bản đồ file nhanh

| Vai trò | File |
|---|---|
| Chat UI | `src/app/components/editor/overlays/AIChatbot.tsx` |
| Ráp runner | `src/ai/agent/createAgentRunner.ts` |
| Vòng lặp + transaction | `src/ai/agent/AgentClient.ts` |
| Prompt | `src/ai/agent/systemPrompt.ts` |
| Mắt (perception) | `src/ai/perception/describeScene.ts` |
| Transport (FE↔BE) | `src/ai/transport/backendTransport.ts` |
| Backend LLM proxy | `02-backend/domains/ai/ai.service.ts` |
| Tools | `src/ai/tools/*.ts` |
| Planner (brief→lưới phòng) | `src/ai/planner/housePlanner.ts` |
| Recipe→ý định | `src/ai/style/recipeToIntents.ts` |
| Style/material chọn | `src/ai/style/styleResolver.ts` |
| Solver (xếp chỗ) | `src/ai/solver/{layoutSolver,anchors,rect,types}.ts` |
| Eval (Tầng A) | `src/ai/eval/spatialAssertions.ts` |
| Skills | `src/ai/skills/*.md` |

> Nguyên tắc bất biến: AI chỉ biên dịch ngôn ngữ → `EngineCommand[]` qua `asyncTransaction`.
> Không chạm ECS/Three.js/toạ độ thô. Solver tự chống chồng (engine không có lưới an toàn cho
> `PLACE_FURNITURE`).
