# AI Architect Assistant — Phương án kiến trúc (thống nhất)

> **Mục tiêu sản phẩm:** Người dùng chỉ tương tác với một trợ lý AI bằng ngôn ngữ tự nhiên
> để **tự động dựng và bố trí cả căn nhà** theo ý muốn — vẽ tường, chia phòng, đặt nội thất,
> chọn vật liệu — mà không cần thao tác editor thủ công.

Trạng thái: **Đề xuất (draft)** · Ngày: 2026-06-12 · Liên quan: `COMMAND-FLOW.md`, `FURNITURE-PLACEMENT-SYSTEM.md`, `ARCHITECTURE.md`

> **Ghi chú phiên bản:** File này hợp nhất hai bản nghiên cứu trước đó:
> - **Phương án A** — `CHATBOT-PLAN.md` (chatbot qua MCP in-process, lấy từ project khác là *Pascal Editor*).
> - **Phương án B** — bản AI Architect dựa trên `dispatcher` của chính project này (giữ làm nền).
>
> Mục §1 phân tích rõ từng phương án và lý do chọn B. `CHATBOT-PLAN.md` giờ là tài liệu tham khảo,
> không còn là phương án thi công độc lập — có thể xoá sau khi đọc xong.

---

## 0. TL;DR — Quyết định

1. **Chọn Phương án B** (dispatcher-based) cho project này. Phương án A được viết cho một codebase
   khác đã có sẵn hạ tầng MCP + SSE + SQLite; bê về đây phải xây lại hạ tầng vô ích.
2. **Kiến trúc gồm 3 lớp trực giao**, đừng trộn lẫn:
   - **Tools (tay)** — macro tools bọc quanh `EngineCommand`, đi qua `dispatcher` → kế thừa miễn phí collision-check, topology reconcile, undo.
   - **Skills (kiến thức)** — kiến thức thiết kế nội thất (cách bố trí phòng ngủ, ánh sáng, lối đi…) đóng gói dạng *progressive disclosure*, load theo nhu cầu. **Đây là mảnh cả hai plan cũ đều thiếu.**
   - **Orchestrator (não)** — vòng lặp agentic của Claude: plan → act → observe → correct.
3. **Hình học do CODE (layout solver) tính, không phải LLM.** LLM làm *semantic*, solver làm *geometry*.
4. **Không dùng Managed Agents** — tool phải mutate scene cục bộ qua `dispatch()`, không chạy được trong container của Anthropic. Dùng **Claude API + tool use** (custom client-side tools).

---

## 1. Hai phương án đã nghiên cứu — phân tích từng cái

### Phương án A — Chatbot qua MCP server in-process

> Nguồn: `CHATBOT-PLAN.md`, rút từ project **Pascal Editor** (Turborepo + Bun, Next.js full-stack).

**Cơ chế.** Một Next.js API route chạy agent loop của Claude, nối vào một **MCP server in-memory**
(qua `InMemoryTransport`) để mượn nguyên ~25 scene-tool đã có. Tool mutate scene → lưu SQLite →
ghi `scene_events` → đẩy về canvas qua **SSE live-sync**. Chat và canvas là 2 kênh tách biệt:
chat trả chữ, canvas tự cập nhật qua SSE.

**Điểm mạnh:**
- Rất cụ thể vì *mọi hạ tầng đã tồn tại* — chỉ là "nối dây", không build lại logic 3D.
- **Tách kênh chat ↔ scene** rất gọn: không phải viết lại render.
- Mượn nguyên bộ tool + validation qua MCP, **không sửa package**.
- Effort thấp — *trong bối cảnh Pascal Editor*.

**Điểm yếu (với 3D-HomeVerse):**
- ❌ **Phụ thuộc hạ tầng project này KHÔNG có:** không có thư mục `mcp/`, không có `SceneOperations`
  headless, không có SQLite `scene_events`, không có SSE route. (Đã xác minh: `glob src/**/mcp/**` → rỗng.)
- ❌ Project này là **frontend** (`01-frontend`), dispatch chạy in-process ngay trên browser; còn
  Pascal dispatch trong Next.js API route. Mô hình SSE polling SQLite 250ms là *thừa* ở đây.
- ❌ **Cho LLM gọi thẳng ~25 scene-tool** ⇒ với "đặt sofa áp tường chừa lối đi 0.7m", LLM phải tự
  tính toạ độ mét — đúng điểm yếu nhất của LLM. Plan A không có lớp solver tách bạch.
- ❌ Mục tiêu A chỉ là *sửa scene từng lệnh nhỏ*, không nhắm "dựng cả căn nhà từ brief".

**Verdict:** Tốt cho Pascal Editor. Với project này, áp dụng = xây lại MCP + SSE + event store
trước khi viết được dòng AI đầu tiên → lãng phí lớn. **Không chọn.**

---

### Phương án B — AI Architect qua `dispatcher` + macro/solver

> Nguồn: bản AI Architect dựa trên kiến trúc thật của 3D-HomeVerse.

**Nền tảng đã xác minh tồn tại trong codebase:**
- `EngineCommand` (`src/engine/commands/EngineCommands.ts`) — discriminated union ~25 lệnh, phủ
  node / wall / furniture / wall-item / material.
- `createDispatcher` (`src/engine/commands/dispatcher.ts`) — **điểm nghẽn mutation duy nhất**, đã có
  collision-check, topology reconcile (cửa/kệ giữ nguyên khi reshape tường), `withTransaction`/undo,
  serialization (`SceneDocument`).
- `objects.json` (`src/data/catalog/`) — catalog model có thật để grounding.

> **Nguyên tắc bất biến:** AI **không** chạm ECS / Three.js / toạ độ thô. AI chỉ "biên dịch"
> ngôn ngữ tự nhiên → chuỗi `EngineCommand`. Mọi đảm bảo đúng đắn kế thừa miễn phí từ dispatcher.

**Điểm mạnh:**
- ✅ Bám đúng kiến trúc thật — không xây lại gì.
- ✅ **Tool 2 cấp** (macro + solver): LLM quyết ý định, code tính toạ độ → tránh điểm yếu hình học của LLM.
- ✅ Tham vọng đúng sản phẩm: dựng & bố trí *cả căn nhà*.
- ✅ Lộ trình MVP rõ (Phase 0–4), Phase 0–1 thấy kết quả trong ~1 tuần.

**Điểm yếu:**
- ⚠️ Nhiều việc phải build mới: perception (`describeScene`), catalog retrieval, và **layout solver** (phần khó nhất).
- ⚠️ Cần quyết surface chạy AI (backend vs frontend) cho an toàn API key — xem §5.
- ⚠️ Bản gốc chưa nhắc tới **Skills** — bổ sung ở §2.

**Verdict:** **Chọn.** Đây là phương án duy nhất grounded vào codebase này, và lớp macro/solver là
khác biệt thiết kế thực chất so với A.

---

### Bảng so sánh

| Tiêu chí | A — MCP in-process | B — dispatcher + macro/solver |
|---|---|---|
| Viết cho project nào | Pascal Editor (project khác) | **Chính 3D-HomeVerse** |
| Điểm bám mutation | MCP server in-memory (~25 tool) | `createDispatcher` (~25 `EngineCommand`) |
| Hạ tầng giả định | MCP + SQLite event stream + SSE | Dispatcher + collision + reconcile + undo (đã có) |
| Hạ tầng đó có ở đây? | **Không có gì** | **Có hết** |
| Ai tính hình học | LLM tự tính toạ độ ⚠️ | **Code (solver)**, LLM chỉ semantic ✅ |
| Cập nhật canvas | SSE polling SQLite ~0.25–0.5s | `dispatch()` in-process → React re-render (tức thì) |
| Mục tiêu | Sửa scene từng lệnh | **Dựng cả căn nhà từ brief** |
| Kết luận | Tham khảo | **Thi công** |

**Điều nên MƯỢN từ A:** tư duy "tách kênh chat ↔ cập nhật scene" và "không viết lại logic mutate,
mượn nguyên bộ đảm bảo". Ở B điều này còn nhẹ hơn: mượn qua `dispatcher` thay vì MCP, và cập nhật
canvas qua re-render in-process thay vì SSE.

---

## 2. Yếu tố thứ ba: Agent Skills — và vì sao nó liên quan

Cả A lẫn B đều cần một thứ chưa gọi tên: **kiến thức thiết kế nội thất** ở lớp orchestrator
("bố trí phòng ngủ thế nào", "đặt đèn ra sao", "tối ưu phòng nhỏ"). A nhồi nó vào system prompt
(`agent-guide`, `constraints`, `scene-guidance` — load *eager*, tốn context). Đây chính là chỗ
**Agent Skills** vào cuộc.

### Phân biệt 3 khái niệm (đừng trộn)

| | **Tools** | **Skills** | **MCP** |
|---|---|---|---|
| Là gì | Hành động có schema, harness thực thi | Thư mục `SKILL.md` chứa quy trình/kiến thức | Server chuẩn hoá expose tool bên thứ 3 |
| Vai trò | "Tay" — *làm* | "Sổ tay" — *biết cách làm* | "Cổng" — nối dịch vụ ngoài |
| Nạp khi nào | Luôn trong context (schema) | **Progressive disclosure**: chỉ mô tả ngắn nằm sẵn, đọc full khi task cần | Khi agent gọi server |
| Trong project này | Macro tools quanh `EngineCommand` | Kiến thức bố trí nội thất | *Không cần* (không có dịch vụ ngoài) |

**Điểm mấu chốt:** Skills **không thay thế** macro tools/dispatcher — chúng **trực giao**.
Tools *mutate scene*; Skills *dạy orchestrator quyết định gì*. Giữ context cố định nhỏ, nạp chi tiết
theo nhu cầu.

### Cách áp dụng cho 3D-HomeVerse

Tách domain knowledge thành các skill load on-demand, ví dụ:
- `furnish-bedroom`, `furnish-living-room`, `furnish-kitchen` — checklist nội thất + ràng buộc bố trí từng loại phòng.
- `lighting-design`, `small-space-optimization`, `traffic-flow` (lối đi) — nguyên tắc ngang hàng.
- `material-pairing` — phối vật liệu (liên kết với plan Material Sidebar đang có).

Orchestrator chỉ giữ *mô tả ngắn* của các skill; khi user nói "làm phòng ngủ 2 người", nó mới đọc
full `furnish-bedroom`. → Giảm token, dễ mở rộng kiến thức mà không phình system prompt.

### Lưu ý về surface (quan trọng)

- **Managed Agents** hỗ trợ Skills *native* (mảng `skills` trên agent) — nhưng ta **không dùng**
  Managed Agents (xem §5), nên không hưởng đường này.
- Trên **raw Messages API + tool use** (đường ta chọn), "Skills" tự hiện thực bằng progressive
  disclosure: để mô tả skill trong system prompt + một tool `read_skill(name)` đọc nội dung, hoặc
  inline nội dung skill liên quan vào context khi cần. Bản chất giống nhau, chỉ là ta tự cài cơ chế nạp.

---

## 3. Kiến trúc thống nhất (5 lớp + Skills)

```
┌─ Người dùng: "Làm cho tôi căn 2 phòng ngủ 60m², bếp mở" ─┐
│                                                          │
▼                                                          │
[1] ORCHESTRATOR (agent loop)  ◄── Claude Opus 4.8 / tool use
│   plan → act → observe → correct                         │
│      ▲                                                   │
│      └─[K] SKILLS (kiến thức, progressive disclosure) ───┤
│           furnish-bedroom / lighting / small-space …     │
│                                                          │
├─[2] PERCEPTION ──► describeScene(): JSON gọn phòng/tường/ │
│     "mắt"           nội thất/chỗ trống (từ SceneDocument) │
│                                                          │
├─[3] CATALOG RETRIEVAL ──► searchCatalog(): chỉ modelId    │
│     "grounding"          CÓ THẬT trong objects.json       │
│                                                          │
├─[4] ACTION TOOLS (macro) ──► expand thành EngineCommand[] │
│     "tay"                  + LAYOUT SOLVER (code) tính toạ độ │
│                                                          │
▼                                                          │
[5] dispatch()/dispatchAsync() qua withTransaction() ◄──────┘
    (collision, topology, undo — MIỄN PHÍ)
```

| Lớp | Vai trò | Điểm bám trong code |
|-----|---------|----------------------|
| 1. Orchestrator | Vòng lặp agentic | Backend gọi Anthropic API (tool use, streaming) |
| K. Skills | Kiến thức thiết kế, nạp theo nhu cầu | `SKILL.md` riêng + cơ chế đọc on-demand |
| 2. Perception | "Mắt" — mô tả scene cho LLM | `SceneDocument`, `RoomSystem` |
| 3. Catalog retrieval | Grounding modelId có thật | `objects.json`, `materials.json`, `FurnitureCatalog.ts` |
| 4. Action tools | Macro tool + solver | wrap quanh `EngineCommand` |
| 5. Dispatch | Thực thi + đảm bảo đúng đắn | `dispatcher.ts`, `useEngineApi.ts` |

---

## 4. Điểm mấu chốt: tool 2 cấp, KHÔNG để LLM gọi command thô

Cho LLM gọi thẳng `ADD_WALL`/`ENSURE_NODE` với UUID là sai lầm: nó phải tự bịa node-id, tự tính
toạ độ mét — LLM rất yếu ở hình học chính xác. Tách 2 cấp:

### Cấp A — Macro tools (AI gọi cái này) — ngữ nghĩa cao, deterministic

| Macro tool | Expand thành `EngineCommand[]` |
|---|---|
| `createRoom({ shape:'rect', x, z, width, depth, wallHeight, thickness })` | 4× `ENSURE_NODE` + 4× `ADD_WALL` (1 transaction) |
| `addOpening({ wallRef, kind:'door'|'window', position })` | `PLACE_WALL_ITEM` (modelId, `t`, `side`) |
| `placeFurniture({ roomId, modelId, against, clearance, facing })` | solver → `PLACE_FURNITURE` (x, z, rotY) |
| `furnishRoom({ roomId, style, items[] })` | nhiều `PLACE_FURNITURE` qua layout solver |
| `setSurfaceMaterial({ target, materialId })` | `SET_WALL_MATERIAL` / `SET_FLOOR_MATERIAL` / `APPLY_FURNITURE_MATERIAL` |
| `resizeRoom({ roomId, edge, delta })` | `MOVE_NODES` (atomic, giữ item bám tường đứng yên) |

### Cấp B — Layout solver (CODE, KHÔNG phải LLM) — ranh giới sống còn

AI quyết **ý định** ("giường áp tường bắc, 2 tủ đầu giường hai bên, chừa lối đi 0.7m").
**Code tính toạ độ chính xác** rồi mới phát `PLACE_FURNITURE`. Solver tái dùng footprint từ
`FurnitureCatalog.getFootprint2D()` và collision-check của dispatcher.

> Mỗi macro tool kết thúc bằng `describeScene()` → agent thấy kết quả thật (kể cả khi dispatcher
> từ chối vì va chạm) → tự sửa. Vòng lặp agentic thực thụ, không phải one-shot.

---

## 5. AI chạy ở đâu — vùng xám lớn nhất cần chốt

**Không dùng Managed Agents.** Managed Agents để Anthropic chạy agent loop *và host container thực thi
tool*. Nhưng tool của ta phải mutate scene cục bộ qua `dispatch()` trong engine — không chạy được
trong container của Anthropic. ⇒ Surface đúng = **Claude API + tool use** (custom client-side tools),
ta tự host vòng lặp.

Còn lại một quyết định kiến trúc (khác biệt lớn nhất so với Pascal, vốn dispatch ngay trong API route):

- **Phương án 5a — Loop ở backend, stream lệnh về frontend (khuyến nghị).** `02-backend` giữ
  `ANTHROPIC_API_KEY`, chạy agent loop. Khi LLM gọi macro tool → backend (hoặc frontend) expand →
  **stream `EngineCommand[]` về frontend** để `dispatch()`. Perception/solver có thể chạy ở phía có
  `SceneDocument`. API key không bao giờ ở client.
- **Phương án 5b — BFF/proxy mỏng.** Frontend chạy phần lớn loop, gọi qua một proxy chỉ để giấu key.
  Đơn giản hơn nhưng logic AI lộ ở client.

→ **Đề xuất 5a.** Cần chốt sớm: solver/perception đặt ở đâu (cần `SceneDocument`), và giao thức
stream lệnh (WebSocket vs SSE vs fetch-stream).

---

## 6. Lộ trình triển khai (MVP → full)

| Phase | Năng lực | Tool/Skill cần | Giá trị |
|-------|----------|----------------|---------|
| **0** | Hỏi-đáp về scene hiện tại | `describeScene` (read-only) | An toàn, build "mắt" trước |
| **1** | Lệnh đơn: *"thêm cửa ở đây", "đặt cái sofa"* | 1 macro → 1–2 command; chốt surface §5 | Chứng minh vòng dispatch chạy |
| **2** | Furnish 1 phòng tự động | layout solver + `searchCatalog` + skill `furnish-*` | Lõi giá trị; test spatial reasoning |
| **3** | **Cả nhà từ brief** | room planner + tất cả macro + skills | Đúng mong muốn sản phẩm |
| **4** | Tinh chỉnh lặp: *"phòng khách rộng hơn", "đổi sofa xám"* | `MOVE_NODES`, material commands | Trải nghiệm "trợ lý" thật |

Phase 0–1 cho kết quả nhìn thấy trong ~1 tuần và validate toàn bộ trục kỹ thuật (gồm cả surface §5).
Skills bắt đầu phát huy từ Phase 2.

---

## 7. Quyết định "vùng xám" cần chốt sớm

1. **Agent emit *commands* hay emit *cả SceneDocument* rồi diff?**
   → **Commands.** Tái dùng mọi đảm bảo của dispatcher, incremental, undo được. Emit cả document =
   bỏ qua collision-check + phải tự viết diff engine.
2. **Hình học do ai tính?** → **Code (solver), tuyệt đối không phải LLM.** Cho nó anchor có tên
   ("north-wall", "center"), solver ra số.
3. **Chống hallucinate modelId** → AI **chỉ** chọn từ kết quả `searchCatalog`. Không tự nghĩ ra `"modern-sofa-grey"`.
4. **AI chạy ở đâu** → §5: Claude API + tool use, loop ở backend (5a), không Managed Agents.
   Model: **Claude Opus 4.8** (`claude-opus-4-8`) cho planner; **Sonnet 4.6** (`claude-sonnet-4-6`) cho bước rẻ.
5. **Guardrail** → mỗi action đã qua dispatcher (validate sẵn) + **preview + confirm** cho thao tác
   lớn ("tôi sẽ dựng 3 phòng, OK?"), bọc trong `withTransaction` để undo nguyên cụm.
6. **Skills nạp thế nào** (raw API) → mô tả ngắn trong system prompt + tool `read_skill(name)`, hay
   inline khi cần? Chốt cơ chế progressive disclosure ở Phase 2.

---

## 8. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|-----------|
| LLM tính toạ độ sai, nội thất chồng nhau | Layout solver deterministic + dispatcher collision-check; agent quan sát rồi sửa |
| Hallucinate modelId / materialId | Bắt buộc qua `searchCatalog`; validate id trước khi dispatch |
| Hành động phá huỷ ngoài ý muốn | `withTransaction` (undo nguyên cụm) + bước confirm |
| Chi phí token khi mô tả scene lớn | `describeScene` JSON gọn; **Skills nạp on-demand** thay vì nhồi hết kiến thức vào system prompt |
| Vòng lặp agent không hội tụ | Giới hạn số bước; fallback "tôi cần bạn làm rõ…" |
| API key lộ ở client | Loop ở backend (§5a), key server-only, KHÔNG `NEXT_PUBLIC_` |

---

## 9. Việc tiếp theo (chọn nhánh để đào sâu)

- **Layout solver** — thuật toán đặt nội thất theo ràng buộc (phần khó nhất).
- **Bộ tool schema cụ thể** — định nghĩa JSON tool-use + mapping macro → `EngineCommand[]`.
- **`describeScene`** — lớp perception: `SceneDocument` → ngữ cảnh cho LLM.
- **Bộ Skills đầu tiên** — `furnish-bedroom` làm mẫu, kèm cơ chế progressive disclosure.
- **Chốt surface §5** — backend loop + giao thức stream lệnh.
- **Chính thức hoá thành AI-SPEC.md** — qua `/gsd-ai-integration-phase`.

---

### Phụ lục — Model ID Claude
- Opus 4.8: `claude-opus-4-8` (mạnh nhất, mặc định cho planner/agent loop)
- Sonnet 4.6: `claude-sonnet-4-6` (rẻ/nhanh hơn cho bước phụ)
- Haiku 4.5: `claude-haiku-4-5`
