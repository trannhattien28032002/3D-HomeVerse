# 3D-HomeVerse — Luồng hoạt động hệ thống (FE ↔ BE ↔ DB/LLM)

> Tài liệu này mô tả thực trạng codebase tại nhánh `feature/tntien/draw2d_v1` (đọc trực
> tiếp từ source, không suy đoán). Mục tiêu: một lập trình viên mới đọc xong hiểu được
> app chạy thế nào từ lúc mở trình duyệt đến lúc dữ liệu nằm trong Postgres.

---

## 1. Tổng quan kiến trúc

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              TRÌNH DUYỆT (FE)                            │
│  React 18 + TypeScript + Vite + Zustand + React Router + three.js/Konva  │
│                                                                            │
│   ┌───────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│   │ Supabase JS    │   │ apiFetch /        │   │ Engine 3D/2D          │  │
│   │ SDK (auth +    │   │ authedFetch       │   │ (three.js scene,      │  │
│   │ storage)       │   │ (data/api/*)      │   │ konva 2D plan, AI     │  │
│   └──────┬─────────┘   └─────────┬─────────┘   │ agent tools)          │  │
│          │                       │              └───────────────────────┘  │
└──────────┼───────────────────────┼───────────────────────────────────────┘
           │ (1) signIn/signUp,     │ (2) Bearer <supabase JWT>
           │     refresh token,     │     REST JSON
           │     storage upload     │
           ▼                       ▼
 ┌────────────────────┐   ┌──────────────────────────────────────────────┐
 │   SUPABASE AUTH      │   │            BACKEND (02-backend)              │
 │   (GoTrue) + Storage  │   │  Express + TypeScript                        │
 │   - cấp JWT (ES256)   │   │  app.ts → middleware → domains/*.routes.ts   │
 │   - JWKS endpoint     │   │  → *.service.ts → *.repository.ts → pg Pool  │
 └─────────┬────────────┘   │  domains: auth, projects, scenes, autosave,  │
           │ verify JWT      │  versions, sharing, library, materials, ai   │
           │ qua JWKS        └──────────┬───────────────────┬──────────────┘
           ▼                            │                   │
 ┌────────────────────┐                 ▼                   ▼
 │  middleware/auth.ts │      ┌───────────────────┐  ┌──────────────────┐
 │  requireAuth verify  │      │ PostgreSQL          │  │ Google Gemini API │
 │  token bằng JWKS     │      │ (Supabase Postgres) │  │ (domains/ai)       │
 │  của chính Supabase  │      │ profiles, projects,  │  │ generateContent +  │
 │  project trên        │      │ autosaves, versions, │  │ function calling   │
 └────────────────────┘      │ project_shares,      │  └──────────────────┘
                              │ library_objects,      │
                              │ materials, operations_│
                              │ log ...               │
                              └───────────────────────┘
```

Điểm mấu chốt: **backend không tự cấp JWT**. Toàn bộ đăng nhập/đăng ký/refresh
token đi qua **Supabase Auth (GoTrue)** trực tiếp từ FE (qua `@supabase/supabase-js`).
Backend chỉ **verify** access token đó bằng JWKS của project Supabase
(`02-backend/middleware/auth.ts:33`), rồi dùng `payload.sub` làm `userId` cho mọi
domain logic. Vì vậy backend là một REST API "đứng sau" Supabase Auth, không phải
nơi phát hành token.

---

## 2. Stack & cấu trúc thư mục

### Backend — `02-backend/`
- Express 4 + TypeScript, chạy bằng `ts-node`/build sang `dist`.
- `app.ts` (`02-backend/app.ts:21`) dựng app: helmet, cors, body-parser, cookie-parser,
  request logger, mount domain router, 404 handler, error handler.
- `server.ts` (`02-backend/server.ts:1`) tạo `http.Server`, ping DB lúc khởi động,
  xử lý graceful shutdown (SIGTERM/SIGINT).
- `configs/` — env, database (Supabase admin client dùng service role key).
- `middleware/` — `auth.ts` (JWT verify + share-token), `validate.ts` (Zod),
  `rateLimiter.ts`, `errorHandler.ts`, `requestLogger.ts`.
- `domains/<name>/` — mỗi domain có cấu trúc thống nhất:
  `*.routes.ts` (Express Router, không chứa business logic) →
  `*.service.ts` (business logic, authorization theo ownerId/shareContext) →
  `*.repository.ts` (SQL thuần qua `pg`, dùng `typedQuery` helper) →
  `*.schema.ts` (Zod schema validate input) → `*.types.ts`.
  Domains hiện có: `auth`, `projects`, `scenes`, `autosave`, `versions`,
  `sharing`, `library`, `materials`, `ai`.
- `migrations/*.sql` — schema Postgres (đánh số thứ tự), chạy thủ công lên
  Supabase Postgres (xem `002_profiles.sql`, `003_projects.sql`,
  `004_autosaves_versions.sql`, `011_sharing.sql`, `014_rls_policies.sql`,
  `015_storage_project_thumbnails.sql`...).
- `shared/` — `db/client.ts` (pg Pool), `db/queryHelper.ts` (`typedQuery` map
  snake_case→camelCase), `db/transaction.ts` (`withTransaction`), `errors/*`
  (AppError, NotFoundError, ForbiddenError, ConflictError, ValidationError),
  `openapi/` (sinh OpenAPI spec phục vụ `/docs/openapi.json`).

### Frontend — `01-frontend/`
- React 18 + TypeScript + Vite, Tailwind cho style, Zustand cho state, React
  Router v6 cho routing, three.js + three/addons cho 3D, Konva cho 2D plan,
  cannon-es cho physics.
- `src/App.tsx` — bootstrap session Supabase rồi mount `Router`.
- `src/app/routes/` — `Routes.tsx` (khai báo route + lazy-load), `PrivateRoute.tsx`
  (`RequireAuth`, `RedirectIfAuthed` dựa trên `useAuthStore`).
- `src/app/store/` — Zustand stores: `useAuthStore.ts` (session Supabase),
  `useUIStore.ts` (UI editor: panel mở/đóng, selection, chế độ 2D/3D...).
- `src/app/pages/` — `HomePage`, `LoginPage`, `RegisterPage`, `ProjectsPage`,
  `EditorPage` (trang lớn nhất, orchestration engine 3D/2D + AI chatbot).
- `src/data/` — lớp gọi API, tách theo domain:
  - `data/auth/` — `supabaseClient.ts` (singleton Supabase client),
    `authApi.ts` (gọi `/auth/*` của backend).
  - `data/api/` — `client.ts` (`apiFetch`, tự gắn Bearer token + parse lỗi
    `{error:{code,message}}` → `ApiError`), `authedFetch.ts` (`fetch` trần có
    gắn Bearer, dùng cho AI transport).
  - `data/projects/` — `projectsApi.ts` (`listProjects`, `createProject`,
    `updateProject`), `uploadThumbnail.ts` (upload thẳng lên Supabase Storage),
    `types.ts`.
  - `data/scene/` — **KHÔNG có module code nào** gọi `/projects/:id/scene`,
    `/autosave`, `/versions`; thư mục chỉ chứa duy nhất một file dữ liệu
    `tenomad.homeverseplan` (~77KB — một scene export mẫu bị commit nhầm vào
    repo, không phải code). Xác nhận: grep toàn `01-frontend/src` cho
    `/scene|autosave|/versions|saveScene|loadScene` chỉ khớp các file *nội bộ
    engine* (`engine/engine.ts`, `setup/systemSetup.ts`,
    `systems/scene/RenderSystem.ts`) — không có lời gọi network nào (xem mục 5.3).
- `src/engine/` — engine 3D/2D độc lập (không phụ thuộc React), quản lý scene
  graph, serialization ra/vào file `.homeverseplan`, hệ thống wall/opening/
  furniture...
- `src/ai/` — AI agent điều khiển scene bằng ngôn ngữ tự nhiên:
  `agent/` (AgentClient vòng lặp tool-use, ToolRegistry, createAgentRunner),
  `tools/` (createRoom, placeFurniture, addOpening, resizeRoom, searchCatalog —
  mỗi tool map sang lệnh engine), `perception/describeScene.ts` (snapshot scene
  hiện tại thành text cho LLM), `transport/backendTransport.ts` (POST
  `/ai/chat`), `catalog/` (tóm tắt catalog nội thất cho system prompt).

---

## 3. Backend — vòng đời một request

1. **`server.ts`** start HTTP server, gọi `pingDatabase()` (fire-and-forget,
   không chặn server nếu DB lỗi).
2. **`app.ts`** áp middleware theo thứ tự: `helmet()` → `cors()` (dev: allow
   all; prod: `origin:false` — TODO wire ALLOWED_ORIGINS, xem mục 7) →
   `express.json({limit:'10mb'})` → `cookieParser()` → `requestLogger`.
3. Route public: `GET /health`, `GET /docs/openapi.json`, `GET /me/ping`
   (route kiểm tra `requireAuth` hoạt động, trả 401 nếu không có token).
4. Domain router được mount, một số dùng `mergeParams` để chia sẻ `:id` với
   `/projects` (vd `scenesRouter`, `autosaveRouter`, `versionsRouter`,
   `sharingRouter` đều mount tại `/projects` — xem `app.ts:62-75`).
5. Trong từng route: `requireAuth` (bắt buộc JWT hợp lệ) hoặc
   `attachUserIfPresent`/`attachShareContext` (optional) → `validate(schema,
   target)` (Zod, ném `ValidationError` nếu sai) → handler gọi
   `service.<fn>(...)` → trả JSON hoặc gọi `next(err)`.
6. Service layer: kiểm tra quyền sở hữu (`project.ownerId !== userId`) hoặc
   `shareContext` (viewer/commenter/editor), rồi gọi repository.
7. Repository: SQL thuần qua `pg` Pool, dùng `typedQuery` để tự map
   snake_case → camelCase. Một số thao tác nhiều bước dùng
   `withTransaction(pool, fn)` (vd autosave insert + prune).
8. Lỗi: mọi handler ném `AppError` con (NotFoundError 404, ForbiddenError 403,
   ConflictError 409, ValidationError 422, AppError tuỳ chỉnh) →
   `errorHandler` (`02-backend/middleware/errorHandler.ts:13`) chuẩn hoá thành
   `{ error: { code, message, details? } }`.

### Bảng domain & trách nhiệm

| Domain | Routes file | Trách nhiệm |
|---|---|---|
| `auth` | `domains/auth/auth.routes.ts` | Đăng ký user qua Supabase Admin API, đọc/cập nhật `profiles` |
| `projects` | `domains/projects/projects.routes.ts` | CRUD project metadata, soft-delete/restore, duplicate |
| `scenes` | `domains/scenes/scenes.routes.ts` | Load/save toàn bộ `scene_data` (JSONB) của 1 project |
| `autosave` | `domains/autosave/autosave.routes.ts` | Lưu autosave định kỳ, giữ tối đa 5 bản gần nhất/project |
| `versions` | `domains/versions/version.routes.ts` | Snapshot có tên (named version), list/get/restore |
| `sharing` | `domains/sharing/sharing.routes.ts` | Quản lý chia sẻ project (viewer/commenter/editor), share token công khai |
| `library` | `domains/library/library.routes.ts` | Catalog đồ nội thất 3D (search FTS/trigram, danh mục, chi tiết) |
| `materials` | `domains/materials/materials.routes.ts` | Catalog vật liệu PBR (search, danh sách, chi tiết) |
| `ai` | `domains/ai/ai.routes.ts` | Proxy chat tới Google Gemini (giữ API key phía server) |

---

## 4. Frontend — khởi động, routing, state, data layer

### 4.1 Khởi động app
`src/App.tsx:12` — `App` gọi `useAuthStore.initAuth()` đúng 1 lần trong
`useEffect`. Hàm này (`src/app/store/useAuthStore.ts:37`):
1. Gọi `supabase.auth.getSession()` để đọc session đã persist (localStorage)
   → set `status: "authed" | "anon"`.
2. Subscribe `supabase.auth.onAuthStateChange` để tự đồng bộ store khi
   login/logout/refresh-token xảy ra ở bất kỳ tab nào.

`App` chỉ render `<Router/>` khi `status !== "loading"` — tránh flash redirect
sai trước khi biết có session hay không.

### 4.2 Routing
`src/app/routes/Routes.tsx:23` khai báo:

| Path | Component | Guard |
|---|---|---|
| `/` | `HomePage` (static import) | không |
| `/login` | `LoginPage` (lazy) | `RedirectIfAuthed` → nếu đã `authed` thì đẩy về `/projects` |
| `/register` | `RegisterPage` (lazy) | `RedirectIfAuthed` |
| `/projects` | `ProjectsPage` (lazy) | `RequireAuth` → nếu `anon` thì đẩy về `/login`, lưu `returnTo` |
| `/project/:id` | `EditorPage` (lazy) | `RequireAuth` |

`RequireAuth`/`RedirectIfAuthed` (`src/app/routes/PrivateRoute.tsx:17`) đọc
`status` từ `useAuthStore`, không tự gọi API — hoàn toàn dựa vào state đã
bootstrap ở bước 4.1.

### 4.3 State management
- `useAuthStore` — session/user Supabase (xem trên).
- `useUIStore` (`src/app/store/useUIStore.ts`) — trạng thái UI editor: panel
  nào đang mở (DecorCatalog, MaterialSidebar, AIChatbot, SaveLoadModal),
  selection hiện tại, tool 2D đang active, viewport size... Không chứa dữ liệu
  scene (dữ liệu scene sống trong engine instance, không phải trong store).

### 4.4 Lớp data/api
- `apiFetch<T>(path, opts)` (`src/data/api/client.ts:39`) là client REST dùng
  chung: tự lấy `access_token` mới nhất từ `supabase.auth.getSession()` mỗi
  lần gọi (supabase-js tự refresh ngầm), gắn header
  `Authorization: Bearer <token>`, set `Content-Type: application/json` khi
  có body, parse lỗi theo envelope backend thành `ApiError` (có `.status`,
  `.code`).
- `authedFetch` (`src/data/api/authedFetch.ts:13`) — bản `fetch` trần (không
  parse JSON/lỗi), cũng tự gắn Bearer token; dùng làm `fetchImpl` cho
  `BackendTransport` của AI agent.
- `data/auth/authApi.ts` — `register()`, `getMe()`, `updateProfile()` gọi
  `/auth/*`.
- `data/projects/projectsApi.ts` — `listProjects()`, `createProject()`,
  `updateProject()` gọi `/projects`.
- `data/projects/uploadThumbnail.ts` — upload **thẳng lên Supabase Storage**
  (bucket `project-thumbnails`), không qua backend; chỉ public URL trả về mới
  được PATCH vào backend qua `updateProject`.

---

## 5. Các luồng end-to-end chính

### 5.1 Luồng Đăng ký / Đăng nhập / Bảo vệ route

```
[RegisterPage]                         [Backend]                [Supabase Auth]
   user nhập email/password/tên
        │
        │ register({email,password,displayName})
        ▼
   authApi.register()
   POST /auth/register  ─────────────────▶ auth.routes.ts (public, validate
        │                                   RegisterSchema)
        │                                  → authService.registerUser()
        │                                    1) supabaseAdmin.auth.admin
        │                                       .createUser() ──────────────▶ tạo
        │                                       (service-role key)            auth.users
        │                                    2) upsertProfile() vào
        │                                       public.profiles (Postgres)
        │                                    3) setDisplayName() nếu có
        │                                  ◀── 201 { id, email, displayName }
        │ (KHÔNG có token trong response — bắt buộc phải tự login)
        ▼
   supabase.auth.signInWithPassword({email,password}) ──────────────────────▶ GoTrue
        │                                                                     cấp access
        │ ◀── session { access_token (JWT ES256), refresh_token } ───────────  + refresh
        ▼                                                                     token
   onAuthStateChange → useAuthStore.status = "authed"
        │
        ▼
   navigate("/projects")


[LoginPage]
   user nhập email/password
        │
        ▼
   supabase.auth.signInWithPassword() ───────────────────────────────────────▶ GoTrue
        │ ◀── session ───────────────────────────────────────────────────────
        ▼
   useAuthStore cập nhật qua onAuthStateChange listener (subscribe từ App)
        │
        ▼
   navigate(returnTo ?? "/projects")


[Mọi request API sau đó]
   apiFetch(path) → supabase.auth.getSession() lấy access_token hiện hành
        │
        ▼
   fetch(BASE_URL+path, { headers: { authorization: `Bearer <token>` }})
        │
        ▼
   [Backend] requireAuth middleware (02-backend/middleware/auth.ts:45)
        - extractToken() từ header Authorization
        - jwtVerify(token, JWKS) — JWKS lấy từ
          `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, thuật toán ES256
        - gắn req.user = { id: payload.sub, email, plan }
        - nếu invalid/hết hạn → 401 UNAUTHORIZED
```

Ghi chú: `RequireAuth`/`RedirectIfAuthed` ở FE chỉ là UX-level guard (đọc
`useAuthStore.status`, không gọi network) — guard "thật sự" về bảo mật nằm ở
backend (`requireAuth` verify JWT bằng JWKS). Nếu token FE có nhưng hết hạn,
mọi gọi `apiFetch` sẽ trả 401 và FE hiện tại **chưa thấy logic tự động
logout/redirect khi nhận 401** (xem mục 7).

### 5.2 Luồng Tạo / Mở danh sách Project

```
[ProjectsPage] mount
        │
        │ useEffect → listProjects()
        ▼
   GET /projects?limit&sort&cursor ─────▶ projects.routes.ts
        (requireAuth, validate query)        → service.listProjects(userId, query)
                                                → repo.listByOwner() (cursor-paginated,
                                                  SELECT theo owner_id, sort updatedAt/
                                                  createdAt/name)
                                              ◀── { data: ProjectMeta[], nextCursor }
        ◀── render grid ProjectCard

[Click "New Project"] → mở CreateProjectModal
        │ nhập tên (+ thumbnail optional) → Submit
        ▼
   createProject({ name, floorCount: 1 })
   POST /projects ───────────────────────▶ projects.routes.ts
        (requireAuth, validate body)          → service.createProject()
                                                → repo.create() INSERT vào
                                                  public.projects (owner_id=userId)
                                              ◀── 201 ProjectMeta
        │
        │ nếu có chọn file ảnh:
        ▼
   uploadThumbnail(file, projectId, userId)
        → supabase.storage.from('project-thumbnails')
            .upload(`${userId}/${projectId}`, file) ─────────▶ Supabase Storage
        ◀── publicUrl                                          (RLS theo
        │                                                       folder=userId)
        ▼
   updateProject(id, { thumbnailUrl })
   PATCH /projects/:id ──────────────────▶ service.updateProject()
        (requireAuth, validate)               → kiểm tra ownerId === userId
                                                → repo.updateMeta() UPDATE
                                              ◀── ProjectMeta đã cập nhật
        │ (lỗi bước upload/PATCH KHÔNG chặn — project đã tồn tại)
        ▼
   onCreated(project) → setProjects([project, ...prev])
   navigate(`/project/${project.id}`)
```

`CreateProjectModal` (`01-frontend/src/app/components/project/CreateProjectModal.tsx:88`)
là nơi điều phối toàn bộ chuỗi POST → upload Storage → PATCH này.

### 5.3 Luồng Scene 3D — load/lưu (HIỆN TRẠNG: chưa nối dây đầy đủ)

Backend đã có đầy đủ 3 domain phục vụ scene:

```
GET  /projects/:id/scene            — load toàn bộ scene_data (JSONB)
PUT  /projects/:id/scene            — ghi đè scene_data (atomic, 1 UPDATE)
POST /projects/:id/autosave         — chèn 1 bản autosave, prune giữ lại 5 bản mới nhất
GET  /projects/:id/autosave/latest  — lấy autosave mới nhất
GET  /projects/:id/versions         — liệt kê version (không kèm scene_data)
POST /projects/:id/versions         — tạo snapshot có tên từ scene hiện tại
GET  /projects/:id/versions/:vid    — lấy 1 version kèm scene_data đầy đủ
POST /projects/:id/versions/:vid/restore — phục hồi project về version này
```
Authorization dùng chung pattern: owner luôn được phép; người giữ share-token
chỉ được phép nếu `shareContext.permission === 'editor'` (autosave/scenes) hoặc
bất kỳ permission nào (load scene — xem `scenes.service.ts:23`).

**Thực tế ở FE hiện tại (`01-frontend/src/app/pages/EditorPage/`)**:
- `useSceneFileIO.ts` (`01-frontend/src/app/pages/EditorPage/useSceneFileIO.ts:28`)
  chỉ implement save/load **ra file local** `.homeverseplan` (Ctrl+S tải file
  JSON về máy qua Blob URL, Ctrl+O đọc file qua `FileReader` rồi
  `deserializeScene`). Đây là tính năng export/import thủ công, không liên hệ
  tới project đang mở trên backend.
- Thư mục `01-frontend/src/data/scene/` **không chứa module code nào** gọi
  `GET/PUT /projects/:id/scene`, `/autosave`, hay `/versions` (chỉ có 1 file
  scene export mẫu `tenomad.homeverseplan`).
- Vì vậy: khi user mở `/project/:id` (`EditorPage`), engine khởi tạo scene
  rỗng/mặc định trong bộ nhớ trình duyệt; **không có lệnh load scene_data từ
  DB theo `:id`**, và không có autosave định kỳ gọi lên backend. Toàn bộ chỉnh
  sửa chỉ tồn tại client-side cho tới khi user tự "Save" ra file
  `.homeverseplan` thủ công.
- `SaveLoadModal` (`01-frontend/src/app/components/editor/overlays/SaveLoadModal.tsx`)
  — **ĐÃ KIỂM CHỨNG: hoàn toàn file-based**, không gọi backend. Component chỉ
  nhận 2 callback `onSave`/`onLoad` (nối vào `useSceneFileIO`), và 2 thẻ hành
  động ghi rõ "Xuất file .homeverseplan" / "Mở file .homeverseplan"
  (`SaveLoadModal.tsx:89,99`). Không có import API/`apiFetch` nào.

=> Đây là khoảng trống lớn nhất giữa BE (đã xong domain `scenes`/`autosave`/
`versions`) và FE (chưa gọi các endpoint này từ trang Editor).

### 5.4 Luồng AI Agent điều khiển scene

```
[AIChatbot UI] user gõ message, nhấn Enter
        │
        ▼
   AgentRunner.run(message)  (tạo bởi createAgentRunner.ts)
        │
        │ 1) describeScene(perception) — snapshot scene hiện tại (phòng, đồ
        │    vật, kích thước...) thành SceneSummary, dùng API "con mắt" đọc
        │    trực tiếp từ engine instance (không qua network)
        ▼
   runAgent(transport, registry, ctx, { message, scene })  (AgentClient.ts)
        │
        │ 2) transport.start({ message, scene, tools }) — lần gọi đầu tiên
        ▼
   BackendTransport.send()
        POST /ai/chat  { system, tools, turns } ───────────▶ ai.routes.ts
        (header Authorization: Bearer <token> gắn sẵn          (requireAuth +
         qua authedFetch)                                       aiLimiter
                                                                  20 req/phút/user
                                                                  + validate
                                                                  ChatBodySchema)
                                                              → ai.service.runChat()
                                                                - dịch turns
                                                                  (NeutralTurn)
                                                                  → Gemini
                                                                  `contents`
                                                                - gọi
                                                                  ai.models
                                                                  .generateContent()
                                                                  trên Google
                                                                  Gemini API ──▶ Gemini
                                                                - retry với    (model
                                                                  backoff cho   gemini-2.5
                                                                  lỗi 429/5xx   -flash)
                                                              ◀── { text,
                                                                    toolCalls,
                                                                    finishReason }
        ◀── ChatResponse JSON
        │
        ▼
   toTurn(resp) → LlmTurn { kind: "tool_use" | "final" }
        │
        ├─ nếu "tool_use": AgentClient lấy từng toolCall (vd placeFurniture,
        │  createRoom, addOpening, resizeRoom, searchCatalog) → ToolRegistry
        │  thực thi tool đó (gọi thẳng vào EngineApi để thêm/sửa object trong
        │  scene 3D — client-side, KHÔNG qua backend) → build LlmToolResult
        │  → transport.next(results) → lặp lại vòng POST /ai/chat cho đến khi
        │  Gemini trả "final"
        │
        └─ nếu "final": text hiển thị cho user trong chat, kết thúc turn.
        │
        ▼
   Engine emit sự kiện thay đổi scene → EditorPage/useEngineSelectionSync,
   RenderSystem... cập nhật UI 3D/2D ngay lập tức (vì tool chạy trực tiếp
   trên engine instance trong cùng tiến trình FE).
```

Điểm quan trọng: **Gemini API key không bao giờ vào bundle FE** — toàn bộ lời
gọi LLM đi qua `POST /ai/chat` ở backend (`02-backend/domains/ai/ai.service.ts:33`
đọc `env.GEMINI_API_KEY`). Các "tool" agent gọi (đặt đồ nội thất, tạo phòng...)
thực thi **client-side trên engine instance**, không có network round-trip
nào tới backend ngoài chính `/ai/chat` — nghĩa là kết quả AI thao tác scene
cũng **không tự động lưu xuống DB** (liên hệ trực tiếp tới khoảng trống ở mục
5.3: phải Save thủ công ra file để không mất).

---

## 6. Bảng tóm tắt endpoint API chính

| Method | Path | Auth | Domain | Mô tả |
|---|---|---|---|---|
| GET | `/health` | không | — | Health check |
| GET | `/docs/openapi.json` | không | — | OpenAPI spec |
| GET | `/me/ping` | requireAuth | — | Test route xác nhận guard hoạt động |
| POST | `/auth/register` | không | auth | Tạo Supabase user + profile, không trả token |
| GET | `/auth/me` | requireAuth | auth | Lấy profile hiện tại (upsert nếu chưa có) |
| PATCH | `/auth/me/profile` | requireAuth | auth | Cập nhật displayName/avatarUrl |
| GET | `/projects` | requireAuth | projects | Danh sách project (cursor-paginated) |
| POST | `/projects` | requireAuth | projects | Tạo project mới |
| GET | `/projects/:id` | requireAuth (+share) | projects | Lấy metadata 1 project |
| PATCH | `/projects/:id` | requireAuth (owner) | projects | Cập nhật metadata |
| DELETE | `/projects/:id` | requireAuth (owner) | projects | Soft-delete |
| POST | `/projects/:id/restore` | requireAuth (owner) | projects | Un-delete |
| POST | `/projects/:id/duplicate` | requireAuth (owner) | projects | Nhân bản project (kèm scene_data) |
| GET | `/projects/:id/scene` | requireAuth (+share) | scenes | Load scene_data đầy đủ |
| PUT | `/projects/:id/scene` | requireAuth (owner/editor) | scenes | Ghi đè scene_data |
| POST | `/projects/:id/autosave` | requireAuth (owner/editor), rate-limited | autosave | Tạo autosave, giữ tối đa 5 bản |
| GET | `/projects/:id/autosave/latest` | requireAuth (owner/editor) | autosave | Lấy autosave mới nhất |
| GET | `/projects/:id/versions` | requireAuth (+share) | versions | Liệt kê version (không kèm scene_data) |
| POST | `/projects/:id/versions` | requireAuth | versions | Tạo named snapshot |
| GET | `/projects/:id/versions/:vid` | requireAuth (+share) | versions | Lấy 1 version đầy đủ |
| POST | `/projects/:id/versions/:vid/restore` | requireAuth | versions | Phục hồi project về version |
| GET | `/projects/:id/share` | requireAuth (owner) | sharing | Liệt kê share |
| POST | `/projects/:id/share` | requireAuth (owner) | sharing | Tạo share (user/link) |
| PATCH | `/projects/:id/share/:shareId` | requireAuth (owner) | sharing | Cập nhật quyền/hạn share |
| DELETE | `/projects/:id/share/:shareId` | requireAuth (owner) | sharing | Thu hồi share |
| GET | `/share/:token` | optional auth | sharing | Resolve share token công khai |
| GET | `/library/categories` | requireAuth | library | Danh mục đồ nội thất |
| GET | `/library/objects/search` | requireAuth, rate-limited | library | Tìm kiếm FTS/trigram |
| GET | `/library/objects` | requireAuth | library | Danh sách phân trang + filter |
| GET | `/library/objects/:slug` | requireAuth | library | Chi tiết 1 object (resolved URL) |
| GET | `/materials/search` | requireAuth, rate-limited | materials | Tìm kiếm vật liệu |
| GET | `/materials` | requireAuth | materials | Danh sách vật liệu |
| GET | `/materials/:slug` | requireAuth | materials | Chi tiết 1 vật liệu |
| POST | `/ai/chat` | requireAuth, rate-limited (20/phút/user) | ai | 1 turn chat với Gemini (provider-neutral wire) |

Mọi response lỗi đều theo envelope: `{ "error": { "code": string, "message":
string, "details"?: unknown } }` (xem `02-backend/middleware/errorHandler.ts:13`).

---

## 7. Ghi chú — điểm chưa hoàn thiện / cần lưu ý

1. **Scene của project chưa load/save xuống backend từ Editor.** Domain
   `scenes`/`autosave`/`versions` đã code và test xong ở BE, nhưng
   `EditorPage` hiện chỉ có save/load file `.homeverseplan` local
   (`useSceneFileIO.ts`). Thư mục `01-frontend/src/data/scene/` đang trống —
   đây gần như chắc chắn là phần đang được phát triển dở dang (khớp với git
   status: nhiều file auth/projects mới nhưng scene thì chưa).
2. **Không có xử lý 401 toàn cục ở FE.** (ĐÃ KIỂM CHỨNG — grep
   `401|signOut|UNAUTHORIZED` trong `01-frontend/src/data` không khớp file
   code nào.) Khi access token Supabase hết hạn giữa chừng (refresh thất bại,
   hoặc revoke), `apiFetch` sẽ ném `ApiError` nhưng không có interceptor nào tự
   động `signOut()`/redirect `/login` — mỗi page tự bắt `ApiError` theo nhu cầu
   riêng (vd `ProjectsPage` chỉ hiện thông báo lỗi).
3. **CORS production chưa wire.** (ĐÃ KIỂM CHỨNG — `app.ts:30-34`.) Production
   set `origin: false` (chặn mọi origin), kèm comment "Phase 1 will wire
   ALLOWED_ORIGINS from env" — nghĩa là **chưa deploy được production thật** cho
   tới khi việc này hoàn tất.
4. **OAuth Google chưa nối dây.** `GoogleSignInButton` ở cả Login/Register có
   handler stub (`console.log("google sign-in")`) — nút bị `disabled`.
5. **`SaveLoadModal` — ĐÃ KIỂM CHỨNG là file-based thuần.** Không gọi backend
   versions/scene API (xem mục 5.3). Điểm nghi vấn này đã đóng.
6. **AI agent không tự lưu kết quả xuống DB.** Vì tool thực thi trực tiếp
   trên engine instance phía client, mọi thay đổi do AI tạo ra chỉ tồn tại
   trong bộ nhớ trình duyệt giống thao tác tay — phụ thuộc hoàn toàn vào luồng
   5.3 còn thiếu để được persist.
7. **`migrations/015_storage_project_thumbnails.sql`** là file mới (untracked).
   ĐÃ KIỂM CHỨNG nội dung: tạo bucket public `project-thumbnails` + 4 RLS policy
   trên `storage.objects`; ràng buộc ghi `(storage.foldername(name))[1] =
   auth.uid()::text` **khớp đúng** convention path `${userId}/${projectId}` mà
   `uploadThumbnail.ts` dùng, và public-read cho phép dùng CDN URL làm
   `thumbnail_url`. Lưu ý còn lại: cần xác nhận migration này đã *chạy thật*
   trên Supabase project trước khi dựa vào tính năng upload ở môi trường khác.

---

## 8. File tham chiếu nhanh

- Backend bootstrap: `02-backend/app.ts`, `02-backend/server.ts`
- Auth middleware: `02-backend/middleware/auth.ts`
- Domain auth: `02-backend/domains/auth/{auth.routes,auth.service,auth.repository}.ts`
- Domain projects: `02-backend/domains/projects/{projects.routes,projects.service,projects.repository,projects.schema}.ts`
- Domain scenes: `02-backend/domains/scenes/{scenes.routes,scenes.service}.ts`
- Domain autosave: `02-backend/domains/autosave/{autosave.routes,autosave.service}.ts`
- Domain versions: `02-backend/domains/versions/version.routes.ts`
- Domain ai: `02-backend/domains/ai/{ai.routes,ai.service}.ts`
- FE bootstrap: `01-frontend/src/App.tsx`, `01-frontend/src/app/routes/Routes.tsx`,
  `01-frontend/src/app/routes/PrivateRoute.tsx`
- FE auth state: `01-frontend/src/app/store/useAuthStore.ts`,
  `01-frontend/src/data/auth/supabaseClient.ts`, `01-frontend/src/data/auth/authApi.ts`
- FE data layer: `01-frontend/src/data/api/client.ts`,
  `01-frontend/src/data/api/authedFetch.ts`,
  `01-frontend/src/data/projects/{projectsApi,uploadThumbnail}.ts`
- FE pages: `01-frontend/src/app/pages/LoginPage/LoginPage.tsx`,
  `01-frontend/src/app/pages/RegisterPage/RegisterPage.tsx`,
  `01-frontend/src/app/pages/ProjectPage/ProjectsPage.tsx`,
  `01-frontend/src/app/pages/EditorPage/EditorPage.tsx`,
  `01-frontend/src/app/pages/EditorPage/useSceneFileIO.ts`
- FE AI agent: `01-frontend/src/ai/agent/createAgentRunner.ts`,
  `01-frontend/src/ai/agent/AgentClient.ts`,
  `01-frontend/src/ai/transport/backendTransport.ts`
