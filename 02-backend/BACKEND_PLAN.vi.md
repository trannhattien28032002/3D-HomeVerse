# Kế hoạch triển khai Backend — 3D Interior Design v1.0

> Nguồn chân lý (source of truth) cho việc bàn giao theo từng giai đoạn của backend Express.js.
> Mọi đường dẫn trong tài liệu này đều tương đối so với `3D-HomeVerse/02-backend/` trừ khi có ghi chú khác.

---

## 0. Các điều chỉnh (2026-06-16) — GHI ĐÈ CÓ THẨM QUYỀN

> Kế hoạch này ban đầu được viết dựa trên một spec `DATABASE_ARCHITECTURE.md` mà mô hình dữ liệu
> của nó kể từ đó đã lệch khỏi frontend thực tế. Ba quyết định bên dưới là **có thẩm quyền (authoritative)**.
> Bất cứ chỗ nào ở phần sau vẫn mô tả mô hình cũ thì **phần này thắng**, và đoạn văn đó phải được
> đọc như đã bị thay thế. Các chỉnh sửa lan truyền đã được áp dụng nội tuyến ở những chỗ thực tế;
> phần còn lại tuân theo các quy tắc này.

### Quyết định A — Định danh của catalog là **slug**, không phải UUID

Catalog của frontend dùng chuỗi slug ổn định làm định danh chính:
`objects.json` → `"bath-01"`, `materials.json` → `"Asphalt031"`. **Các slug này được nhúng
trực tiếp bên trong `scene_data`** (`SceneFurnitureRecord.modelId`, `SceneWallItemRecord.modelId`,
và các map `materials: Record<slotId, materialId>` theo từng slot; xem
`01-frontend/src/engine/serialization/SceneDocument.ts`).

Hệ quả:
- `library_objects` và `materials` dùng **slug của catalog làm khóa chính** (`id TEXT PRIMARY KEY`),
  hoặc một UUID PK cộng với `slug TEXT UNIQUE NOT NULL` mà API luôn phơi bày ra cho client dưới dạng `id`.
  Dù theo cách nào, **giá trị mà frontend gửi/nhận chính là slug**.
- `scene_data` tham chiếu objects và materials **chỉ bằng slug**. API không bao giờ được phép viết lại
  các tham chiếu này thành UUID. Đổi tên một slug của catalog là một thay đổi phá vỡ(breaking change)
  đòi hỏi phải migrate dữ liệu.
- Categories (`bathroom`, `ground`, `ceramic`, …) cũng tương tự là **chuỗi slug**, không phải các hàng UUID.

### Quyết định B — Scene là một blob `scene_data` JSONB duy nhất; **bỏ `project_objects` và toàn bộ bộ máy bảng tương thích**

Frontend serialize đúng một blob `SceneDocument` (`serializeScene()` →
`useSceneFileIO.ts`). Không có mảng theo-từng-object riêng biệt nào ở phía client.

Hệ quả:
- **Loại bỏ `project_objects`** (bảng, migration `010_project_objects.sql`, nhánh `objects: ProjectObject[]`
  của contract lưu/tải scene, logic bulk-upsert / xóa-các-mục-đã-bỏ, và các nhánh sao chép/đồng bộ-lại
  project_objects của thao tác nhân bản và khôi phục phiên bản). Lưu scene = ghi một cột JSONB. Nhân bản =
  sao chép hàng (gồm cả `scene_data`). Khôi phục phiên bản = sao chép `scene_data` ngược lại. Tất cả trở thành
  thao tác trên một-hàng-duy-nhất; các transaction đa-bảng nặng nề cho ba thao tác này không còn cần thiết
  (insert+prune của autosave là transaction duy nhất còn lại).
- **Loại bỏ hệ thống con tương thích (compatibility)**: các bảng `object_categories`, `category_material_compat`,
  `object_material_compat_override`; các migration `005` (object_categories) và `009` (compat tables);
  hàm SQL `compatible_material_categories()`; cache ma trận tương thích trong bộ nhớ và
  `warmupCompatibilityCache()`; và endpoint `GET /materials/compatible/:objectId`.
  Tính tương thích đã nằm sẵn **bên trong từng object** dưới dạng `materialSlots[].allowedCategories` (theo-từng-slot,
  ví dụ `body → ["ceramic","stone"]`). Frontend phân giải nó ở phía client bằng cách lọc materials theo
  category. Backend chỉ cần trả về materials được nhóm/lọc được theo slug `category` của chúng.
- Các hàng `library_objects` còn phải lưu thêm các trường thiết yếu của frontend (dưới dạng JSONB khi có
  cấu trúc): `materialSlots`, `materialBindings` (meshName/materialName/slotId), `boundingBox`
  `{width,depth,height}`, `collisionBox` `{width,depth}`, `topDown.imageUrl` (góc nhìn mặt bằng 2D),
  `category` (slug), `modelUrl`, `thumbnailUrl`. Materials lưu `category` (slug), `icon`, và một
  map `textures` (`color/normal/roughness/ao`, đường dẫn KTX2).
- Việc kiểm tra scene phía server giữ ở **Option A** (RQ-5): chỉ xác minh rằng `scene_data` là một JSON
  object với một trường `version` kiểu số. Không gắn kết API với hình dạng `SceneDocument` đang tiến hóa
  (`materialFaces`, `floors` đặt khóa theo roomKey, `y` của furniture, v.v. đều có thể thay đổi tự do ở phía client).

### Quyết định C — Thêm **domain AI** vào kế hoạch; ghi nhận rằng **frontend chưa có Supabase auth**

`02-backend/domains/ai/` **đã được triển khai** nhưng vắng mặt trong kế hoạch này: `POST /ai/chat`,
một proxy trung lập về nhà cung cấp (provider-neutral) tới Google Gemini (`ai.types.ts`, `ai.routes.ts`, `ai.service.ts`,
`ai.schema.ts`). Nó giờ là một domain hạng nhất — xem **Phase 11: AI Domain** mới ở dưới và
hàng của nó trong bảng API Surface.

Thực tế quan trọng mà kế hoạch này phải ngừng giả định bỏ qua: **frontend hiện chưa thể lấy được
một Supabase JWT.** `ai.routes.ts` chạy một guard `devOnly` không xác thực (từ chối ở production)
chính vì lý do "FE hiện chưa có cơ chế lấy Supabase token." Toàn bộ mô hình tin cậy của kế hoạch này
("Express verify một JWT trên mỗi request") do đó **bị chặn bởi việc đấu nối auth của frontend mà
hiện chưa tồn tại**. Việc này được theo dõi dưới dạng **RQ-0** trong phần Câu hỏi mở và trên thực tế
nó chặn việc nghiệm thu Phase 0/2.

---

## Mục lục

0. [Các điều chỉnh (2026-06-16) — Ghi đè có thẩm quyền](#0-các-điều-chỉnh-2026-06-16--ghi-đè-có-thẩm-quyền)
1. [Tóm tắt tổng quan](#1-tóm-tắt-tổng-quan)
2. [Kiểm kê hiện trạng](#2-kiểm-kê-hiện-trạng)
3. [Kế hoạch bàn giao theo giai đoạn](#3-kế-hoạch-bàn-giao-theo-giai-đoạn)
4. [Các mối quan tâm xuyên suốt](#4-các-mối-quan-tâm-xuyên-suốt)
5. [Kế hoạch Migration](#5-kế-hoạch-migration)
6. [Bảng API Surface](#6-bảng-api-surface)
7. [Chiến lược kiểm thử](#7-chiến-lược-kiểm-thử)
8. [Rủi ro và câu hỏi mở](#8-rủi-ro-và-câu-hỏi-mở)
9. [Ước lượng công sức](#9-ước-lượng-công-sức)

---

## 1. Tóm tắt tổng quan

### Phạm vi

Kế hoạch này bao quát toàn bộ việc triển khai REST API Express.js nằm giữa frontend React Three Fiber
và cơ sở dữ liệu PostgreSQL được host trên Supabase. API là ranh giới tin cậy (trust boundary) duy nhất
cho mọi mutation đã xác thực. Nó xử lý việc verify JWT, áp đặt quy tắc nghiệp vụ, điều phối transaction,
và trả về lỗi có cấu trúc.

Các domain trong phạm vi:

- Auth (đồng bộ profile, đọc/cập nhật profile tự phục vụ)
- Projects (CRUD, soft-delete, list phân trang theo cursor, nhân bản nguyên tử — sao chép một-hàng `scene_data`)
- Scenes (tải và lưu một blob `scene_data` JSONB duy nhất — xem Quyết định B; không có `project_objects`)
- Autosave (insert + prune-giữ-5-bản-cuối)
- Versions (tạo snapshot `scene_data` bất biến, list, khôi phục)
- Library (tìm kiếm catalog object, lọc, phân trang cursor; đặt khóa theo slug — xem Quyết định A)
- Materials (tìm kiếm catalog + lọc theo slug category; tính tương thích đến từ
  `materialSlots[].allowedCategories` của từng object, phân giải ở phía client — không có bảng compat, xem Quyết định B)
- AI (proxy chat trung lập về nhà cung cấp tới Gemini — đã triển khai, xem Phase 11 và Quyết định C)
- Sharing (chia sẻ theo người dùng định danh, chia sẻ bằng link với token, hết hạn, thu hồi)
- Hardening (áp đặt RLS, rate limiting, tài liệu OpenAPI, integration tests)

### Phi mục tiêu (Non-Goals)

- Không tái triển khai Supabase Auth (đăng ký, đăng nhập, xác minh email, làm mới token). Các luồng đó được
  frontend gọi trực tiếp tới Supabase Auth. Backend chỉ tiêu thụ JWT thu được.
- Không phơi bày PostgREST cho các đường ghi của frontend.
- Không cộng tác thời gian thực (Supabase Realtime, logic merge CRDT). Schema đã sẵn sàng; tính năng được hoãn lại.
- Không có admin panel hay UI quản lý nội dung cho catalog library.
- Không có logic thanh toán / subscription ngoài việc đọc cột `plan` trên `profiles`.

### Stack

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Runtime | Node.js 18+ (LTS) | Ổn định, thân thiện async, hệ sinh thái rộng |
| Framework | Express 5 (đã có trong package.json) | Tối giản, được hiểu rõ, đã cài sẵn |
| Ngôn ngữ | TypeScript (strict mode, target ES2020) | Đã cấu hình trong tsconfig.json |
| DB client | node-postgres (`pg`) | Đã cài sẵn; không có overhead của ORM |
| Validation | Zod | Schema-first, tích hợp gọn với suy luận kiểu của TypeScript |
| Auth | Supabase JWT (JWKS hoặc shared secret — xem Câu hỏi mở) | Tránh phải tái triển khai auth |
| Storage | Supabase Storage qua `@supabase/storage-js` | Tài nguyên nhị phân phục vụ qua CDN |
| Logging | pino (đã có trong package.json) | Log JSON có cấu trúc, overhead thấp |
| Migrations | File SQL đánh số thuần + script runner tự viết | Không ORM; khớp với Section 11 của spec |

### Ranh giới kiến trúc

Express là lớp phân quyền chính. Nó verify mọi JWT, kiểm tra quyền sở hữu / quyền chia sẻ ở lớp service,
và chỉ khi đó mới phát hành SQL. RLS trên PostgreSQL là lớp phòng thủ chiều sâu (defense-in-depth) — nó
không được dùng làm cổng phân quyền duy nhất.

Khóa `service_role` của Supabase chỉ do tiến trình Express nắm giữ, không bao giờ phơi bày ra client. Mọi
mutation đều đi qua API.

---

## 2. Kiểm kê hiện trạng

### Liệt kê file

Bảng sau mô tả mọi file không thuộc `node_modules` được tìm thấy dưới `02-backend/` tại thời điểm kiểm kê này.

Chú giải: **Empty** = file có 0–1 dòng (tồn tại nhưng không có gì hành động được); **Stub** = file chứa một
dòng comment đơn nói rõ mục đích; **Scaffolded** = file có cấu trúc có ý nghĩa nhưng chưa có triển khai;
**Implemented** = file hoàn chỉnh về chức năng.

#### File gốc (Root)

| File | Trạng thái | Ghi chú |
|---|---|---|
| `app.ts` | Scaffolded | Dùng kiểu CommonJS `require()`; mount một module `./routes` và một `./middleware/CorsMiddleware` không tồn tại trong cấu trúc mới. Cần viết lại hoàn toàn sang kiểu import tương thích TypeScript ESM, stack middleware đúng, và mount domain router. |
| `server.ts` | Empty | Một dòng trắng. Cần triển khai entry-point: import app, gọi `app.listen`. |
| `package.json` | Implemented | Các dependency đã cài: `express`, `pg`, `pino`, `helmet`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `cors`, `date-fns`, `dotenv`, `nodemon`, `tsx`, `typescript`. Thiếu: `zod`, `@supabase/supabase-js` (cho verify auth JWT và storage), `pino-http` (request logger). Dev dependency thiếu: `@types/pg`, `@types/cookie-parser`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcryptjs`, test runner (`vitest` hoặc `jest`). |
| `tsconfig.json` | Implemented | Cấu hình đúng (strict, ES2020, commonjs). Không cần thay đổi. |
| `properties.dev.env` | Scaffolded | Chứa các trường kết nối Postgres cũ (`POSTGRE_HOST`, `POSTGRE_USER`, v.v.) và `SERVER_PORT`. Thiếu toàn bộ trường Supabase: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_CDN_URL`, `NODE_ENV`. Cần cập nhật sang mô hình kết nối dựa trên Supabase. |

#### `configs/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `configs/env.ts` | Stub | Chỉ có comment. Cần schema env được Zod validate đầy đủ. |
| `configs/database.ts` | Stub | Chỉ có comment. Cần singleton pg Pool + Supabase client. |
| `configs/storage.ts` | Stub | Chỉ có comment. Cần khởi tạo Supabase Storage client. |

Lưu ý: spec dùng `config/` (số ít). Scaffold hiện có dùng `configs/` (số nhiều). Kế hoạch giữ `configs/` để tránh đổi tên file đang có.

#### `middleware/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `middleware/auth.ts` | Stub | Chỉ có comment. Cần verify JWT + gắn `req.user`. |
| `middleware/errorHandler.ts` | Stub | Chỉ có comment. Cần ánh xạ AppError sang HTTP. |
| `middleware/requestLogger.ts` | Stub | Chỉ có comment. Cần tích hợp pino-http. |
| `middleware/validate.ts` | Stub | Chỉ có comment. Cần factory middleware Zod. |

Lưu ý: `app.ts` tham chiếu một `middleware/CorsMiddleware` không tồn tại dưới dạng stub. Nó sẽ được thay bằng cấu hình của package `cors` chuẩn bên trong `app.ts`.

#### `shared/db/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `shared/db/client.ts` | Empty | Cần export pg Pool. |
| `shared/db/transaction.ts` | Empty | Cần helper `withTransaction` (spec cung cấp triển khai chính xác). |
| `shared/db/queryHelper.ts` | Empty | Cần mapper camelCase và wrapper query có kiểu. Lưu ý: spec đặt tên là `queryHelpers.ts` (số nhiều); file hiện có là `queryHelper.ts` (số ít). Giữ dạng số ít. |

#### `shared/errors/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `shared/errors/AppError.ts` | Empty | Cần lớp lỗi cơ sở có `statusCode`. |
| `shared/errors/NotFoundError.ts` | Empty | Kế thừa AppError, HTTP 404. |
| `shared/errors/ForbiddenError.ts` | Empty | Kế thừa AppError, HTTP 403. |
| `shared/errors/ValidationError.ts` | Empty | Kế thừa AppError, HTTP 422. |

#### `shared/storage/` và `shared/types/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `shared/storage/storageClient.ts` | Empty | Cần các helper Supabase Storage. |
| `shared/types/express.d.ts` | Empty | Cần augment kiểu `req.user`. |
| `shared/types/supabase.ts` | Empty | Kiểu Supabase được sinh tự động (chạy sau migrations). |

#### `domains/auth/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/auth/auth.routes.ts` | Stub | Một comment: "POST /auth/register, /auth/login, /auth/verify-email". Các luồng này thuộc về Supabase Auth, không phải API này. Route thực tế là GET /auth/me và PATCH /auth/me/profile. File routes cần viết lại. |
| `domains/auth/auth.service.ts` | Stub | Comment: "register, login, verifyEmail, refreshToken logic". Phạm vi phải chuyển sang chỉ đồng bộ profile và cập nhật tự phục vụ. |
| `domains/auth/auth.repository.ts` | Stub | Truy vấn bảng profiles. Cần triển khai. |
| `domains/auth/auth.schema.ts` | Stub | Cần Zod schema. |
| `domains/auth/auth.types.ts` | Stub | Cần TypeScript types. |

#### `domains/projects/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/projects/projects.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/projects/projects.service.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/projects/projects.repository.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/projects/projects.schema.ts` | Empty | Cần Zod schema. |
| `domains/projects/projects.types.ts` | Empty | Cần TypeScript types. |

#### `domains/scenes/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/scenes/scenes.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/scenes/scenes.service.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/scenes/scenes.repository.ts` | Empty | Cần triển khai bulk upsert. |
| `domains/scenes/scenes.schema.ts` | Empty | Cần `SaveSceneBodySchema` (chỉ validate `version` kiểu số, còn lại passthrough — Quyết định B). Không có schema `ProjectObject`. |
| `domains/scenes/scenes.types.ts` | Empty | Cần TypeScript types. |

#### `domains/autosave/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/autosave/autosave.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/autosave/autosave.service.ts` | Stub | Comment: "insert + prune logic (hourly limit)". Lưu ý đề cập "hourly limit" — spec nói giữ-5-bản-cuối, không phải theo giờ. Quyết định hành vi nào là đúng (xem Câu hỏi mở). |
| `domains/autosave/autosave.repository.ts` | Stub | Comment liệt kê đúng các route. Cần triển khai. |
| `domains/autosave/autosave.types.ts` | Empty | Cần TypeScript types. |

#### `domains/versions/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/versions/version.routes.ts` | Empty | Cần triển khai đầy đủ. Lưu ý tên file là `version.routes.ts` (số ít), trong khi mọi file khác trong thư mục là `versions.*`. Giữ số ít cho routes để khớp stub hiện có. |
| `domains/versions/versions.service.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/versions/versions.repository.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/versions/version.types.ts` | Empty | Cần TypeScript types. Lưu ý: `versions.schema.ts` vắng mặt — cần tạo. |

#### `domains/library/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/library/library.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/library/library.service.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/library/library.repository.ts` | Empty | Cần các truy vấn phân trang cursor FTS + trgm. |
| `domains/library/library.schema.ts` | Empty | Cần Zod schema LibrarySearchQueryDto. |
| `domains/library/library.types.ts` | Empty | Cần TypeScript types. |

#### `domains/materials/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/materials/materials.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/materials/materials.service.ts` | Empty | Cần list/search catalog + phân giải URL texture. Không có compat cache (Quyết định B). |
| `domains/materials/materials.repository.ts` | Empty | Cần lọc-theo-category + phân trang cursor + tìm kiếm FTS/trgm. Không có truy vấn compat (Quyết định B). |
| `domains/materials/materials.schema.ts` | Empty | Cần Zod schema. |
| `domains/materials/materials.types.ts` | Empty | Cần TypeScript types. |

#### `domains/sharing/`

| File | Trạng thái | Ghi chú |
|---|---|---|
| `domains/sharing/sharing.routes.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/sharing/sharing.services.ts` | Empty | Lưu ý: tên file là `sharing.services.ts` (số nhiều có 's'), khác với mọi domain khác dùng `sharing.service.ts`. Khuyến nghị đổi tên thành `sharing.service.ts` cho nhất quán. |
| `domains/sharing/sharing.repository.ts` | Empty | Cần triển khai đầy đủ. |
| `domains/sharing/sharing.schema.ts` | Empty | Cần Zod schema. |
| `domains/sharing/sharing.types.ts` | Empty | Cần TypeScript types. |

#### `migrations/`

Thư mục `migrations/` chưa tồn tại. Toàn bộ 14 file SQL migration và script runner phải được tạo.

### Tóm tắt trạng thái

- **Đã triển khai đầy đủ**: `tsconfig.json`, `package.json` (một phần — thiếu deps)
- **Scaffolded (cần viết lại)**: `app.ts`, `properties.dev.env`
- **Stub (chỉ có comment — cần triển khai)**: `configs/env.ts`, `configs/database.ts`, `configs/storage.ts`, cả bốn file middleware, `domains/auth/*.ts`
- **Empty (0 nội dung — cần triển khai đầy đủ)**: tất cả các file domain còn lại, tất cả file `shared/`
- **Thiếu hoàn toàn**: thư mục `migrations/` và tất cả file SQL, `migrations/runner.ts`, `versions.schema.ts`, các file test

---

## 3. Kế hoạch bàn giao theo giai đoạn

Các giai đoạn xây dựng nghiêm ngặt trên nhau. Không bắt đầu một giai đoạn cho tới khi mọi phụ thuộc của nó đã xanh (green).

---

### Phase 0: Nền móng (Foundations)

**Mục tiêu**: Thiết lập phần lõi đáng tin cậy mà mọi giai đoạn sau phụ thuộc vào. Sau giai đoạn này, server
khởi động, kết nối Supabase Postgres, validate biến môi trường lúc khởi động, log request, và từ chối
request không xác thực với hình dạng lỗi đúng chuẩn.

**File cần tạo / sửa**:

| Hành động | Đường dẫn |
|---|---|
| Sửa | `app.ts` — viết lại hoàn toàn: import TypeScript, stack middleware (helmet, cors, pino-http, json body parser, mount route, error handler) |
| Triển khai | `server.ts` — import createApp, gọi listen, xử lý SIGTERM/SIGINT một cách duyên dáng (graceful) |
| Triển khai | `configs/env.ts` — Zod schema validate mọi biến môi trường bắt buộc; throw lúc khởi động nếu thiếu |
| Triển khai | `configs/database.ts` — singleton pg Pool; Supabase client (service role) để verify auth JWT |
| Triển khai | `configs/storage.ts` — khởi tạo Supabase Storage client |
| Triển khai | `middleware/auth.ts` — trích Bearer token, verify JWT, gắn `req.user = { id, email, plan }` |
| Triển khai | `middleware/errorHandler.ts` — bắt các lớp con AppError, ánh xạ sang HTTP status + JSON `{ error: { code, message, details? } }` |
| Triển khai | `middleware/requestLogger.ts` — pino-http với truyền tiếp (passthrough) header correlation ID |
| Triển khai | `middleware/validate.ts` — factory: `validate(schema)` trả về Express middleware chạy Zod parse và throw ValidationError |
| Triển khai | `shared/db/client.ts` — export `pool` (pg.Pool dùng DATABASE_URL từ env) |
| Triển khai | `shared/db/transaction.ts` — helper `withTransaction<T>(pool, fn)` |
| Triển khai | `shared/db/queryHelper.ts` — mapper `toCamel(row)` snake_case-sang-camelCase; wrapper `typedQuery<T>(client, sql, params)` |
| Triển khai | `shared/errors/AppError.ts` — lớp cơ sở: `message`, `statusCode`, chuỗi `code` |
| Triển khai | `shared/errors/NotFoundError.ts` — 404, code `NOT_FOUND` |
| Triển khai | `shared/errors/ForbiddenError.ts` — 403, code `FORBIDDEN` |
| Triển khai | `shared/errors/ValidationError.ts` — 422, code `VALIDATION_ERROR`, mang mảng Zod issue |
| Triển khai | `shared/storage/storageClient.ts` — các helper `resolvePublicUrl(path)`, `createSignedUrl(path, expiresIn)` |
| Triển khai | `shared/types/express.d.ts` — augment `Express.Request` với `user: { id: string; email: string; plan: string }` |
| Thêm deps | `package.json` — thêm `zod`, `@supabase/supabase-js`, `pino-http`; thêm dev deps `@types/pg`, `@types/cookie-parser`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcryptjs`, `vitest` |
| Cập nhật | `properties.dev.env` — thêm `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_CDN_URL`, `NODE_ENV` |

**Endpoint bàn giao**: Không (chỉ hạ tầng). Nên thêm một probe `GET /health` trả về `{ status: "ok", timestamp }`
trực tiếp vào `app.ts` như route phi-domain duy nhất.

**Bảng DB / migration chạm tới**: Không (Phase 1 xử lý migration).

**Tiêu chí nghiệm thu**:
- `tsx server.ts` khởi động không lỗi khi mọi biến môi trường được thiết lập.
- Một biến môi trường bắt buộc bị thiếu khiến tiến trình thoát với thông báo mô tả rõ ràng trước khi bind cổng.
- `GET /health` trả về HTTP 200 với `{ status: "ok" }`.
- `GET /` không có header Authorization trả về HTTP 401 `{ error: { code: "UNAUTHORIZED", message: "..." } }` (xác minh auth middleware đã đấu nối).
- Một `throw new NotFoundError("x")` cố ý trong route test tạo ra HTTP 404 `{ error: { code: "NOT_FOUND", ... } }`.
- pino ghi JSON có cấu trúc ra stdout trên mỗi request.

**Phụ thuộc**: Không (giai đoạn đầu tiên).

---

### Phase 1: Migration Runner và file SQL 001–002

**Mục tiêu**: Thiết lập schema cơ sở dữ liệu trong Supabase Postgres qua các file SQL migration đánh số. Cung cấp
một runner lặp lại được, idempotent. Sau giai đoạn này, `profiles` và hạ tầng extension/trigger tồn tại trong DB.

**File cần tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo thư mục | `migrations/` |
| Tạo | `migrations/001_extensions_and_triggers.sql` |
| Tạo | `migrations/002_profiles.sql` |
| Tạo | `migrations/run.ts` — script migration runner: đọc thư mục `migrations/` theo thứ tự số, theo dõi migration đã áp dụng trong bảng `schema_migrations`, chạy từng file chưa áp dụng trong một transaction |
| Thêm script | `package.json` — thêm `"db:migrate": "tsx migrations/run.ts"` |

**Endpoint bàn giao**: Không.

**Bảng DB / migration chạm tới**:
- `001`: extension (`uuid-ossp`, `pgcrypto`, `citext`, `pg_trgm`, `unaccent`), hàm trigger dùng chung `set_updated_at()`.
- `002`: bảng `profiles`, trigger `trg_profiles_updated_at`.

**Tiêu chí nghiệm thu**:
- `npm run db:migrate` chạy hoàn tất trên một Supabase database sạch không lỗi.
- Chạy lại `npm run db:migrate` là no-op (idempotent qua bảng `schema_migrations`).
- Bảng `profiles` tồn tại trong schema `public` với cột và ràng buộc đúng.
- Cả năm extension đều có mặt (`\dx` trong psql hiển thị chúng).

**Phụ thuộc**: Phase 0 (biến môi trường đã validate, DATABASE_URL khả dụng).

---

### Phase 2: Auth Domain

**Mục tiêu**: Triển khai domain auth. Frontend xử lý mọi luồng Supabase Auth (đăng ký, đăng nhập, xác minh email,
làm mới token). Domain này chỉ chịu trách nhiệm đồng bộ profile (upsert ở request đã xác thực đầu tiên),
tự đọc (self-read), và cập nhật profile.

**File cần sửa / triển khai**:

| Hành động | Đường dẫn |
|---|---|
| Triển khai | `domains/auth/auth.types.ts` — kiểu `UserProfile` khớp bảng `profiles` |
| Triển khai | `domains/auth/auth.schema.ts` — `UpdateProfileSchema` (Zod: display_name, avatar_url tùy chọn) |
| Triển khai | `domains/auth/auth.repository.ts` — `upsertProfile(client, userId, email)`, `findProfileById(client, id)`, `updateProfile(client, id, data)` |
| Triển khai | `domains/auth/auth.service.ts` — `syncProfile(userId, email)` (upsert khi login), `getMe(userId)`, `updateMe(userId, data)` |
| Triển khai | `domains/auth/auth.routes.ts` — mount GET /auth/me, PATCH /auth/me/profile; loại bỏ các stub register/login/verify |
| Sửa | `app.ts` — mount auth router tại `/auth` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /auth/me | Trả về profile đầy đủ của user đã xác thực (id, email từ JWT + các cột profile). Upsert hàng profile ở lần gọi đầu tiên cho một user Supabase mới. Response: `{ id, email, displayName, avatarUrl, plan, storageUsed, createdAt }` |
| PATCH | /auth/me/profile | Cập nhật `display_name` và/hoặc `avatar_url`. Body được UpdateProfileSchema validate. Response: object profile đã cập nhật. |

**Bảng DB / migration chạm tới**: `profiles` (read/upsert/update).

**Tiêu chí nghiệm thu**:
- `GET /auth/me` với một Supabase JWT hợp lệ trả về 200 và object profile.
- `GET /auth/me` với JWT hết hạn trả về 401.
- `GET /auth/me` cho user chưa có hàng profile sẽ tạo hàng (upsert) và trả về nó.
- `PATCH /auth/me/profile` với `{ displayName: "Alice" }` cập nhật và trả về hàng.
- `PATCH /auth/me/profile` với `{ displayName: "" }` (chuỗi rỗng) trả về lỗi validation 422.

**Phụ thuộc**: Phase 0 (auth middleware), Phase 1 (bảng profiles tồn tại).

---

### Phase 3: Projects Domain

**Mục tiêu**: Toàn bộ vòng đời project: tạo, đọc, list (phân trang cursor), cập nhật metadata, soft-delete,
khôi phục, và nhân bản nguyên tử.

**File cần triển khai**:

| Hành động | Đường dẫn |
|---|---|
| Triển khai | `domains/projects/projects.types.ts` |
| Triển khai | `domains/projects/projects.schema.ts` — `CreateProjectSchema`, `UpdateProjectSchema`, `ListProjectsQuerySchema` (cursor, limit, filter) |
| Triển khai | `domains/projects/projects.repository.ts` — `findById`, `listByOwner` (phân trang cursor), `create`, `updateMeta`, `softDelete`, `restore`, `duplicate` (transaction) |
| Triển khai | `domains/projects/projects.service.ts` — kiểm tra quyền sở hữu trên mọi mutation; gọi các phương thức repository; duplicate gọi `withTransaction` |
| Triển khai | `domains/projects/projects.routes.ts` — mount mọi endpoint; auth middleware trên tất cả; validate body request |
| Sửa | `app.ts` — mount projects router tại `/projects` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects | List project chưa-bị-xóa của người gọi. Query: `?cursor=<opaque>&limit=<int>&sort=updated_at`. Response: `{ data: Project[], nextCursor: string \| null }` |
| POST | /projects | Tạo project. Body: `{ name?, floorCount? }`. Response 201: hàng project mới (id, name, floorCount, createdAt, updatedAt). |
| GET | /projects/:id | Lấy metadata một project (không có scene data). 404 nếu không tìm thấy hoặc đã xóa. 403 nếu không phải chủ (hoặc viewer được chia sẻ — xem Phase 9). |
| PATCH | /projects/:id | Cập nhật metadata project (name, thumbnail_url, isTemplate, isPublic). Chỉ chủ. |
| DELETE | /projects/:id | Soft-delete (đặt `deleted_at`). Chỉ chủ. Response 204. |
| POST | /projects/:id/restore | Hủy xóa một project đã soft-delete. Chỉ chủ. Response 200. |
| POST | /projects/:id/duplicate | Sao chép một-hàng của project, gồm cả `scene_data`. Tên project mới = gốc + " (Copy)". Response 201: id và name project mới. |

**Bảng DB / migration chạm tới**: Chỉ `projects`.

Lưu ý (đã chỉnh theo Quyết định B): duplicate là một `INSERT ... SELECT` đơn sao chép hàng (gồm cả
`scene_data`). Không có nhánh sao chép `project_objects`, nên endpoint có thể triển khai trọn vẹn trong
Phase 3 và không còn phụ thuộc Phase 4. Transaction là tùy chọn (một câu lệnh duy nhất).

**Tiêu chí nghiệm thu**:
- `POST /projects` tạo hàng và trả về 201.
- `GET /projects` trả về kết quả phân trang cursor; request trang thứ hai với `?cursor=<value>` trả về trang kế.
- `DELETE /projects/:id` bởi người không phải chủ trả về 403.
- `GET /projects/:id` sau khi soft-delete trả về 404.
- `POST /projects/:id/restore` làm project xuất hiện lại trong list.
- Các lệnh duplicate đồng thời không tạo hàng mồ côi (xác minh bằng cách bọc trong `withTransaction`).

**Phụ thuộc**: Phase 0 (auth, xử lý lỗi), Phase 2 (profiles tồn tại cho FK).

---

### Phase 4: Scenes Domain

> **Đã chỉnh theo Quyết định B.** Không có bảng `project_objects` và không có `objects[]` trong contract.
> Một scene là một blob `scene_data` JSONB. Save là một UPDATE một-hàng; load là một SELECT một-hàng.

**Mục tiêu**: Triển khai chu trình lưu/tải scene có thẩm quyền. PUT ghi `projects.scene_data` (một cột);
GET trả về nó.

**File cần triển khai**:

| Hành động | Đường dẫn |
|---|---|
| Chạy migration | `migrations/003_projects.sql` (bảng `projects`, vốn đã mang `scene_data JSONB`) |
| Triển khai | `domains/scenes/scenes.types.ts` |
| Triển khai | `domains/scenes/scenes.schema.ts` — `SaveSceneBodySchema = { sceneData }` trong đó `sceneData` là JSON object mà trường duy nhất được validate là `version` kiểu số (RQ-5 Option A — còn lại passthrough) |
| Triển khai | `domains/scenes/scenes.repository.ts` — `loadScene(client, projectId)`, `saveSceneData(client, projectId, sceneData)` |
| Triển khai | `domains/scenes/scenes.service.ts` — `loadScene` (kiểm tra sở hữu/chia sẻ, trả về scene_data), `saveScene` (kiểm tra sở hữu/chia-sẻ-editor, UPDATE scene_data + touch updated_at) |
| Triển khai | `domains/scenes/scenes.routes.ts` |
| Sửa | `domains/projects/projects.service.ts` — `duplicate` là sao chép một-hàng (`scene_data` của hàng mới = `scene_data` nguồn); không có nhánh project_objects |
| Sửa | `app.ts` — mount scenes router dưới `/projects/:id/scene` hoặc lồng trong projects router |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/scene | Tải scene: trả về `{ sceneData: {...} }`. `sceneData` tham chiếu objects/materials của catalog bằng **slug** (Quyết định A); frontend phân giải slug dựa trên catalog. Backend không viết lại hay phân giải URL bên trong `scene_data`. |
| PUT | /projects/:id/scene | Lưu scene. Body: `{ sceneData: {...} }`. UPDATE `projects.scene_data` và `updated_at`. Response 200: `{ savedAt: ISO timestamp }`. |

**Bảng DB / migration chạm tới**: Chỉ `projects` (`scene_data`, `updated_at`).

**Tiêu chí nghiệm thu**:
- `PUT /projects/:id/scene` rồi `GET /projects/:id/scene` round-trip blob đúng từng byte (deep-equal).
- Một `sceneData` thiếu `version` kiểu số bị từ chối 422; bất kỳ hình dạng nào khác được chấp nhận nguyên trạng (passthrough).
- Lưu một scene thực tế (ví dụ 50 mục furniture + wallItems bên trong blob) hoàn thành dưới 200ms ở local.
- Trả về 403 nếu người gọi không sở hữu project (ghi qua editor-share đến trong Phase 9).
- Các slug bên trong `scene_data` được trả về không đổi (API không được biến đổi tham chiếu object/material).

**Phụ thuộc**: Phase 0, Phase 2, Phase 3.

---

### Phase 5: Autosave Domain

**Mục tiêu**: Triển khai chu trình autosave tần suất cao ghi vào `project_autosaves` (không phải `projects.scene_data`)
và prune để chỉ giữ 5 mục cuối cho mỗi project.

**File cần triển khai / tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/004_autosaves_versions.sql` — bảng `project_autosaves` và `project_versions` (cả hai scaffold cùng nhau) |
| Triển khai | `domains/autosave/autosave.types.ts` |
| Triển khai | `domains/autosave/autosave.repository.ts` — `insertAutosave(client, projectId, sceneData, clientId)`, `pruneAutosaves(client, projectId, keepLast)`, `getLatestAutosave(client, projectId)` |
| Triển khai | `domains/autosave/autosave.service.ts` — kiểm tra sở hữu; insert; prune (giữ-5-bản-cuối); trả về id và saved_at của autosave đã lưu |
| Triển khai | `domains/autosave/autosave.routes.ts` |
| Sửa | `app.ts` — mount autosave routes lồng dưới `/projects/:id` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| POST | /projects/:id/autosave | Insert autosave. Body: `{ sceneData: {...}, clientId?: string }`. Prune để giữ 5 bản cuối sau khi insert. Response 201: `{ id, savedAt }`. |
| GET | /projects/:id/autosave/latest | Lấy autosave gần nhất của một project. Response: `{ id, sceneData, savedAt, clientId }`. 404 nếu không có. |

**Bảng DB / migration chạm tới**: `project_autosaves`.

**Tiêu chí nghiệm thu**:
- 6 lệnh POST autosave liên tiếp để lại đúng 5 hàng trong `project_autosaves` cho project đó.
- GET latest trả về scene data của hàng được insert gần nhất nguyên văn.
- Trả về 403 cho người không phải chủ (hoặc non-editor share ở Phase 9).
- Thao tác prune chạy trong cùng transaction với insert (không có hàng mồ côi nếu insert thất bại).

**Phụ thuộc**: Phase 0, Phase 2, Phase 3.

---

### Phase 6: Versions Domain

**Mục tiêu**: Triển khai snapshot phiên bản bất biến: create (snapshot scene hiện tại), list, và restore
(sao chép scene_data của phiên bản ngược lại vào project).

**File cần triển khai / tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/004_autosaves_versions.sql` — đã lên kế hoạch trong Phase 5 (gồm cả bảng `project_versions`) |
| Tạo | `domains/versions/versions.schema.ts` — `CreateVersionSchema` (trường label) |
| Triển khai | `domains/versions/version.types.ts` |
| Triển khai | `domains/versions/versions.repository.ts` — `createVersion(client, projectId, label, userId)` dùng hàm `next_project_version()`, `listVersions(client, projectId)`, `getVersion(client, versionId)`, `restoreVersion(client, projectId, versionId)` |
| Triển khai | `domains/versions/versions.service.ts` — kiểm tra sở hữu; create (snapshot `projects.scene_data` vào một hàng `project_versions`); restore (một UPDATE sao chép `project_versions.scene_data` ngược lại vào `projects.scene_data` — không đồng bộ-lại project_objects theo Quyết định B) |
| Triển khai | `domains/versions/version.routes.ts` |
| Sửa | `app.ts` — mount versions routes |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/versions | List các phiên bản của project, sắp theo version_num DESC. Response: `{ data: Version[] }` (không có scene data trong list). |
| POST | /projects/:id/versions | Tạo một snapshot có tên của `projects.scene_data` hiện tại. Body: `{ label?: string }`. Response 201: `{ id, versionNum, label, createdAt }`. |
| GET | /projects/:id/versions/:vid | Lấy một phiên bản gồm cả scene_data đầy đủ. |
| POST | /projects/:id/versions/:vid/restore | Khôi phục project về phiên bản này. Một UPDATE sao chép `project_versions.scene_data` vào `projects.scene_data`. Response 200: `{ restoredAt }`. |

**Bảng DB / migration chạm tới**: `project_versions`, `projects` (restore cập nhật `scene_data`).

**Tiêu chí nghiệm thu**:
- POST /versions tạo một hàng với `version_num` tự tăng bắt đầu từ 1.
- POST /versions lần hai tạo ra version_num = 2.
- GET /versions liệt kê mới nhất trước.
- POST /versions/:vid/restore rồi GET /projects/:id/scene trả về scene từ phiên bản đó.
- Restore là một UPDATE một-hàng; không có đồng bộ-lại đa-bảng nào để thất bại (Quyết định B).

**Phụ thuộc**: Phase 0, Phase 2, Phase 3, Phase 5 (chia sẻ migration 004 tạo `project_versions`).

---

### Phase 7: Library Domain

> **Đã chỉnh theo Quyết định A + B.** Objects được **đặt khóa theo slug**. Categories là chuỗi slug thuần trên
> object (`category: "bathroom"`), không phải một bảng cây UUID riêng — `migration 005_object_categories`
> bị **loại bỏ**. Mỗi object lưu các trường thiết yếu của frontend liệt kê trong Quyết định B.

**Mục tiêu**: Triển khai catalog library object: duyệt object (phân trang cursor, có lọc), tìm kiếm full-text +
trigram, list category riêng biệt cho UI lọc, và chi tiết một-object.

**File cần triển khai / tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/006_library_objects.sql` — bảng `library_objects` đặt khóa theo `id TEXT PRIMARY KEY` (slug catalog). Cột: `name`, `category TEXT` (slug), `model_url`, `thumbnail_url`, `topdown_url`, `bounding_box JSONB`, `collision_box JSONB`, `material_slots JSONB`, `material_bindings JSONB`, `is_premium`, `is_active`, `search_vector TSVECTOR`; trigger FTS + hàm cập nhật tsvector; enum `placement_surface` chỉ giữ nếu một trường `placement` được thêm vào catalog (kiểm tra — các mục `objects.json` thấy đến nay không có) |
| Triển khai | `domains/library/library.types.ts` — `LibraryObject` phản chiếu hình dạng mục catalog (slug id, materialSlots, materialBindings, boundingBox, collisionBox, topDown) |
| Triển khai | `domains/library/library.schema.ts` — `LibrarySearchQuerySchema` (q, category, isPremium, cursor, limit) |
| Triển khai | `domains/library/library.repository.ts` — `listObjects` (phân trang cursor, lọc theo slug category), `searchObjects` (FTS + trgm), `getObjectBySlug`, `listCategories` (`SELECT DISTINCT category`) |
| Triển khai | `domains/library/library.service.ts` — phân giải URL CDN cho `modelUrl`/`thumbnailUrl`/`topDown` và các trường object không-texture; định tuyến giữa search và browse dựa trên sự hiện diện của `q`; gating premium dựa trên `req.user.plan` |
| Triển khai | `domains/library/library.routes.ts` |
| Sửa | `app.ts` — mount library router tại `/library` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /library/categories | Các slug category riêng biệt đang dùng (cho chip lọc). Response: `{ data: string[] }`. Cache trong bộ nhớ (TTL 5 phút). |
| GET | /library/objects | List object phân trang. Query params: `category` (slug), `isPremium`, `cursor`, `limit` (mặc định 50, tối đa 100). Response: `{ data: LibraryObject[], nextCursor }`. |
| GET | /library/objects/search | Tìm kiếm FTS + trigram. Query params: `q` (bắt buộc), `category`, `limit`. Response: `{ data: LibraryObject[] }` (không có cursor; giới hạn ở 20). |
| GET | /library/objects/:slug | Chi tiết một object với mọi trường (materialSlots, materialBindings, boundingBox, collisionBox, topDown) + `modelUrl`/`thumbnailUrl` đã phân giải. |

**Bảng DB / migration chạm tới**: `library_objects` (không có `object_categories`).

**Caching**: List category riêng biệt được nạp vào một Map trong bộ nhớ lúc khởi động (xem Section 4 — Caching).
Không tồn tại ma trận tương thích (Quyết định B).

**Tiêu chí nghiệm thu**:
- `GET /library/objects?category=bathroom` chỉ trả về object có slug `category` là `bathroom`.
- `GET /library/objects/search?q=armchair` trả về kết quả liên quan (xác minh dựa trên dữ liệu đã seed).
- Tìm kiếm trigram: `?q=armchiar` (gõ sai) vẫn trả về "armchair".
- Phân trang cursor: trang 2 với `?cursor=<value>` không lặp lại trang 1.
- `GET /library/objects/:slug` trả về `materialSlots[].allowedCategories` để frontend lọc materials theo từng slot.
- Các object `is_premium = true` bị ẩn khi `req.user.plan === 'free'` (nếu gating premium được bật — xem Câu hỏi mở).
- URL gốc CDN được tiền tố vào `modelUrl` trong response; `id` slug trả về không đổi.

**Phụ thuộc**: Phase 0, Phase 1 (extension cho trgm/citext).

---

### Phase 8: Materials Domain

> **Đã chỉnh theo Quyết định A + B.** Không có bảng tương thích, không có hàm `compatible_material_categories()`,
> không có cache ma trận compat, không có endpoint `/materials/compatible/:objectId`. Tính tương thích
> đã được biểu diễn theo-từng-slot bên trong mỗi library object (`materialSlots[].allowedCategories`) và được
> phân giải ở phía client. Backend chỉ phục vụ một catalog material đặt khóa theo slug, lọc được theo category.

**Mục tiêu**: Triển khai catalog material đặt khóa theo slug: list/lọc theo category, tìm kiếm FTS + trigram,
chi tiết một-material với URL texture KTX2 đã phân giải.

**File cần triển khai / tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/007_material_categories.sql` — tùy chọn: một lookup nhỏ các slug category material riêng biệt (`ground`, `ceramic`, `metal`, `stone`, …) cho UI lọc; có thể thay bằng `SELECT DISTINCT category` nếu một bảng là quá mức |
| Tạo | `migrations/008_materials.sql` — bảng `materials` đặt khóa theo `id TEXT PRIMARY KEY` (slug catalog). Cột: `name`, `category TEXT` (slug), `icon_url`, `textures JSONB` (`{ color, normal, roughness, ao }` đường dẫn KTX2), `is_premium`, `is_active`, `search_vector TSVECTOR GENERATED ALWAYS AS (...) STORED`; index FTS; index trgm |
| ~~Đã loại bỏ~~ | ~~`migrations/009_compat_tables.sql`~~ — đã xóa theo Quyết định B |
| Triển khai | `domains/materials/materials.types.ts` — `Material` phản chiếu mục catalog (slug id, slug category, icon, map textures) |
| Triển khai | `domains/materials/materials.schema.ts` — `MaterialSearchQuerySchema` (q, category, cursor, limit) |
| Triển khai | `domains/materials/materials.repository.ts` — `listMaterials` (phân trang cursor, lọc theo slug category), `getMaterialBySlug`, `searchMaterials` (FTS + trgm) |
| Triển khai | `domains/materials/materials.service.ts` — phân giải URL CDN cho `icon` và mỗi đường dẫn texture |
| Triển khai | `domains/materials/materials.routes.ts` |
| Sửa | `app.ts` — mount materials router tại `/materials` (không warm-up compat cache) |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /materials | List materials. Query: `category` (slug), `cursor`, `limit`. Response: `{ data: Material[], nextCursor }`. |
| GET | /materials/search | Tìm kiếm FTS + trgm. Query: `q`, `category`, `limit`. Response: `{ data: Material[] }`. |
| GET | /materials/:slug | Chi tiết một material với URL texture đã phân giải (color/normal/roughness/ao). |

> Bộ chọn material của frontend cho một slot object cụ thể gọi `GET /materials?category=<allowed>` cho
> mỗi category trong `allowedCategories` của slot đó, hoặc fetch catalog một lần và lọc trong bộ nhớ.
> Không cần endpoint "materials tương thích cho object" ở phía server.

**Bảng DB / migration chạm tới**: `materials` (và tùy chọn `material_categories`).

**Tiêu chí nghiệm thu**:
- `GET /materials?category=metal` chỉ trả về materials có slug `category` là `metal`.
- `GET /materials/search?q=asphalt` trả về "Asphalt 031" (xác minh dựa trên dữ liệu đã seed).
- `GET /materials/:slug` trả về URL CDN đã phân giải cho cả bốn texture map; `id` slug trả về không đổi.
- Tìm kiếm trigram chịu được sai một-ký-tự trong query.

**Phụ thuộc**: Phase 0, Phase 1.

---

### Phase 9: Sharing Domain

**Mục tiêu**: Triển khai chia sẻ project: chia sẻ theo người dùng định danh, chia sẻ bằng link (dựa trên token),
hết hạn, mức quyền, và thu hồi. Cập nhật auth middleware để nhận diện share token.

**File cần triển khai / tạo**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/011_sharing.sql` — enum `share_permission`, bảng `project_shares`, các index |
| Triển khai | `domains/sharing/sharing.types.ts` |
| Triển khai | `domains/sharing/sharing.schema.ts` — `CreateNamedShareSchema`, `CreateLinkShareSchema`, `UpdateShareSchema` |
| Đổi tên | `domains/sharing/sharing.services.ts` → `domains/sharing/sharing.service.ts` (sửa sự không nhất quán đặt tên) |
| Triển khai | `domains/sharing/sharing.service.ts` — tạo named share, tạo link share (sinh token 32-hex), cập nhật quyền, thu hồi, list các share của project, phân giải share token |
| Triển khai | `domains/sharing/sharing.repository.ts` — CRUD trên `project_shares`, `findByToken`, `listForProject` |
| Triển khai | `domains/sharing/sharing.routes.ts` |
| Sửa | `middleware/auth.ts` — tùy chọn chấp nhận query param `?shareToken=<token>` cho truy cập link share trên các endpoint đọc; validate token với DB, gắn `req.shareContext = { projectId, permission }` |
| Sửa | `domains/projects/projects.service.ts` — tôn trọng `req.shareContext` trên GET /projects/:id |
| Sửa | `domains/scenes/scenes.service.ts` — cho phép editor share PUT /projects/:id/scene |
| Sửa | `app.ts` — mount sharing routes dưới `/projects/:id/share` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/share | List mọi bản ghi share của project (chỉ chủ). Response: `{ data: Share[] }`. |
| POST | /projects/:id/share | Tạo một named-user hoặc link share. Body: `{ sharedWith?: uuid, permission: "viewer"\|"commenter"\|"editor", expiresAt?: ISO }`. Nếu `sharedWith` vắng mặt, sinh một token link share. Response 201: `{ id, token?, permission, expiresAt }`. |
| PATCH | /projects/:id/share/:shareId | Cập nhật quyền hoặc hết hạn. Chỉ chủ. |
| DELETE | /projects/:id/share/:shareId | Thu hồi một share (hard-delete hàng). Chỉ chủ. Response 204. |
| GET | /share/:token | Phân giải một share token: trả về metadata công khai của project và mức quyền của share. Frontend dùng để render một view được chia sẻ mà không cần đăng nhập cho các viewer share. |

**Bảng DB / migration chạm tới**: `project_shares`.

**Tiêu chí nghiệm thu**:
- POST share với `sharedWith = null` trả về một trường `token`.
- GET /projects/:id/scene với `?shareToken=<valid_viewer_token>` trả về 200.
- GET /projects/:id/scene với `?shareToken=<expired_token>` trả về 403.
- PUT /projects/:id/scene với một viewer share token trả về 403.
- PUT /projects/:id/scene với một editor share token trả về 200.
- DELETE share xóa hàng; các request sau đó với token đó trả về 403.

**Phụ thuộc**: Phase 0, Phase 2, Phase 3, Phase 4.

---

### Phase 10: Hardening

**Mục tiêu**: Áp dụng các policy RLS, phủ validation request đầy đủ, rate limiting theo từng endpoint, tài liệu
OpenAPI, và bộ integration test. Giai đoạn này không thêm tính năng mới; nó làm mọi thứ đạt chuẩn production.

**File cần tạo / sửa**:

| Hành động | Đường dẫn |
|---|---|
| Tạo | `migrations/012_operations_log.sql` — bảng `project_operations` + partition ban đầu. **Tùy chọn cho v1** (scaffold CRDT tương lai; chưa có frontend consumer — cân nhắc hoãn) |
| Tạo | `migrations/013_indexes.sql` — mọi index từ Section 5 của spec, **trừ bất kỳ index `project_objects` / bảng compat nào** (các bảng đó không còn tồn tại — Quyết định B) |
| Tạo | `migrations/014_rls_policies.sql` — mọi câu lệnh RLS ENABLE + policy, **trừ bảng `project_objects` / `object_categories` / compat** (Quyết định B) |
| Sửa | `middleware/auth.ts` — thêm các context rate limit theo từng route |
| Tạo | `middleware/rateLimiter.ts` — cấu hình các instance `express-rate-limit`: `standardLimiter` (100 req/phút), `autosaveLimiter` (120 req/phút cho POST /autosave), `searchLimiter` (30 req/phút cho các endpoint search) |
| Tạo | `shared/openapi/openapi.ts` — spec OpenAPI 3.1 viết tay hoặc sinh tự động; phục vụ tại `GET /docs/openapi.json` |
| Tạo | thư mục `tests/` với các integration test (xem Section 7) |
| Sửa | `package.json` — thêm script `"test": "vitest run"` và `"test:watch": "vitest"` |

**Endpoint bàn giao**:

| Method | Path | Contract |
|---|---|---|
| GET | /docs/openapi.json | Phục vụ tài liệu đặc tả OpenAPI 3.1. Không cần auth. |

**Bảng DB / migration chạm tới**: `project_operations` (scaffold), mọi bảng (RLS enable + policy), mọi index được áp dụng.

**Tiêu chí nghiệm thu**:
- `GET /library/objects` với 200 request nhanh trong 60 giây từ cùng một IP bị rate-limit sau ngưỡng.
- POST /projects/:id/autosave ở 3 request/giây không tạo hàng trùng (idempotency qua transaction).
- Mọi endpoint liệt kê trong bảng API Surface (Section 6) trả về response 422 đúng chuẩn khi body request không hợp lệ.
- `npm run test` pass với coverage trên 80% qua các file service và repository.
- Migration RLS áp dụng sạch; một truy vấn psql trực tiếp dưới `auth.uid()` khác không trả về các hàng nó không nên thấy.
- `GET /docs/openapi.json` trả về một tài liệu OpenAPI 3.1 hợp lệ.

**Phụ thuộc**: Tất cả giai đoạn trước.

---

### Phase 11: AI Domain (đã triển khai — cần gắn thêm auth)

> **Thêm theo Quyết định C.** Domain này đã tồn tại trong `02-backend/domains/ai/` và được xây dựng
> ngoài kế hoạch gốc. Giai đoạn này ghi lại nó và theo dõi công việc để làm nó sẵn sàng production.

**Mục tiêu**: Proxy chat trung lập về nhà cung cấp cho phép AI agent của frontend điều khiển scene. Frontend
gửi một định dạng wire trung lập (`turns` của user/assistant/tool + tool schema); backend dịch sang
Google Gemini API, gọi nó, và chuẩn hóa kết quả thành `{ text, toolCalls, finishReason }`.
Khóa nhà cung cấp (`GEMINI_API_KEY`) chỉ nằm trên server; đổi nhà cung cấp chỉ chạm tới
`ai.service.ts`, không bao giờ chạm frontend.

**Trạng thái hiện tại** (tính đến điều chỉnh này):

| File | Trạng thái |
|---|---|
| `domains/ai/ai.routes.ts` | Implemented — `POST /ai/chat`, được bảo vệ bởi một cổng `devOnly` tạm thời (từ chối với 503 `AI_DISABLED_IN_PROD` khi `NODE_ENV === 'production'`) vì frontend chưa thể lấy được Supabase JWT |
| `domains/ai/ai.types.ts` | Implemented — kiểu wire trung lập (`NeutralTurn`, `ToolSchema`, `AgentToolCall`, `ChatRequest`, `ChatResponse`) |
| `domains/ai/ai.service.ts` | Implemented — dịch + gọi Gemini |
| `domains/ai/ai.schema.ts` | Implemented — `ChatBodySchema` |

**Endpoint bàn giao**:

| Method | Path | Auth | Contract |
|---|---|---|---|
| POST | /ai/chat | **Hiện không có** (`devOnly`); mục tiêu: JWT | Body: `{ system?, tools?, turns, maxTokens? }`. Response: `{ text, toolCalls, finishReason }`. Một lượt Gemini. |

**Công việc còn lại để đạt chuẩn production**:
- Thay guard `devOnly` bằng `requireAuth` một khi frontend đấu nối Supabase auth (xem RQ-0).
- Áp dụng một rate limiter chuyên biệt (gọi AI đắt — bảo vệ quota Gemini).
- Tùy chọn quy usage cho `req.user.id` để tính quota / chi phí theo từng người dùng.

**Bảng DB / migration chạm tới**: Không có hôm nay. Nếu thêm tính toán usage, một bảng tương lai
`ai_usage` có thể ghi số token theo từng người dùng.

**Tiêu chí nghiệm thu**:
- Với auth được đấu nối, `POST /ai/chat` không có JWT hợp lệ trả về 401 (không phải passthrough dev hiện tại).
- Endpoint bị rate-limit; một burst vượt ngưỡng AI limiter trả về 429.
- `GEMINI_API_KEY` không bao giờ bị phơi bày trong bất kỳ response hay log nào.

**Phụ thuộc**: Phase 0 (auth middleware, xử lý lỗi). **Bị chặn bởi RQ-0** (Supabase auth của frontend) cho việc gỡ bỏ guard production.

---

## 4. Các mối quan tâm xuyên suốt

### Luồng xác thực (Authentication Flow)

1. Frontend xác thực với Supabase Auth và nhận một access token (JWT).
2. Mọi request API kèm `Authorization: Bearer <token>` trong header.
3. `middleware/auth.ts` trích token và verify chữ ký của nó. Có hai phương án (xem Câu hỏi mở):
   - Phương án A (khuyến nghị): verify với endpoint JWKS của Supabase (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) dùng `jsonwebtoken` + fetch JWKS có caching. Không cần lưu JWT secret trong env.
   - Phương án B (đơn giản hơn): verify đối xứng HS256 dùng `SUPABASE_JWT_SECRET` từ env. Cần secret hiện diện trong môi trường deploy.
4. Khi thành công, payload đã giải mã được gắn dưới dạng `req.user = { id: sub, email, plan }`. Trường `plan` cần đọc profile từ DB; ngoài ra, một custom Supabase JWT claim có thể mang nó (xem Câu hỏi mở).
5. Khi thất bại, `next(new UnauthorizedError("Invalid or expired token"))` lan tới error handler.

Với các endpoint link-share, `middleware/auth.ts` thêm việc kiểm tra query parameter `?shareToken` và gắn
`req.shareContext` khi tìm thấy một share token hợp lệ, chưa hết hạn. Các endpoint đã xác thực mà cũng chấp nhận
share token phải xử lý cả `req.user` (nếu có) và `req.shareContext`.

### Phân loại lỗi (Error Taxonomy)

Mọi lỗi kế thừa `AppError(message, statusCode, code)`. Error handler trong `middleware/errorHandler.ts` bắt chúng và tạo:

```
HTTP <statusCode>
{
  "error": {
    "code": "<string>",
    "message": "<human-readable>",
    "details": [...]   // tùy chọn, các Zod issue cho ValidationError
  }
}
```

| Lớp | HTTP | Code |
|---|---|---|
| `AppError` | 500 | `INTERNAL_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` (thêm lớp này ở Phase 0) |
| `ValidationError` | 422 | `VALIDATION_ERROR` |
| `ConflictError` | 409 | `CONFLICT` (thêm nếu cần cho slug trùng, v.v.) |

Các lỗi không xử lý (không phải lớp con AppError) được error handler bắt, log ở mức `error` với full stack trace,
và trả về dưới dạng HTTP 500 `INTERNAL_ERROR` mà không phơi bày stack trace ra client.

### Mẫu Validation

Factory middleware `validate` trong `middleware/validate.ts` nhận một Zod schema và một mục tiêu (`body`, `query`,
hoặc `params`). Nó parse mục tiêu, thay thế nó bằng giá trị đã parse/ép kiểu (để các handler ở sau nhận dữ liệu có
kiểu), và gọi `next(new ValidationError(...))` khi parse thất bại.

Cách dùng trong routes:

```
router.post('/', auth, validate(CreateProjectSchema, 'body'), handler)
```

Mọi body request, mọi chuỗi query phân trang, và mọi UUID path param phải được validate qua Zod trước khi tới lớp service.

### DB Query Helpers

`shared/db/queryHelper.ts` cung cấp:

- `toCamel(row: Record<string, unknown>)`: chuyển mọi khóa snake_case trong một hàng kết quả truy vấn sang camelCase. Áp dụng cho mọi kết quả repository trước khi trả về lớp service.
- `typedQuery<T>(client: PoolClient | Pool, sql: string, params: unknown[]): Promise<T[]>`: bọc `client.query(sql, params)` và áp dụng `toCamel` cho mọi hàng. Trả về một mảng có kiểu hoặc mảng rỗng. Throw một `AppError` cho các lỗi DB bất ngờ.

Mọi repository dùng `typedQuery`. Không có lệnh `client.query` thô nào ngoài các file repository.

### Sử dụng Transaction

`withTransaction` từ `shared/db/transaction.ts` được dùng cho các thao tác nguyên tử. **Theo Quyết định B**,
lưu scene, nhân bản project, và khôi phục phiên bản giờ là các câu lệnh một-hàng và không còn
cần transaction. Transaction đa-câu-lệnh duy nhất còn lại là:

- Autosave insert + prune-giữ-5-bản-cuối

Các read một-bảng và mutation một-hàng (lưu/tải scene, duplicate, tạo/khôi phục version) không cần transaction;
chúng dùng pool trực tiếp.

### Phân giải URL Storage

Cơ sở dữ liệu lưu các đường dẫn Supabase Storage trần (ví dụ `objects/furniture/chairs/eames.glb`). Lớp service
phân giải chúng thành URL dùng được trước khi trả dữ liệu cho client:

- **Tài nguyên công khai** (library objects, materials): dựng dưới dạng `${SUPABASE_STORAGE_CDN_URL}/storage/v1/object/public/assets/<path>`. CDN không yêu cầu auth.
- **Tài nguyên premium / riêng tư**: một signed URL được sinh qua `createSignedUrl(path, expirySeconds)` trong `shared/storage/storageClient.ts`. Signed URL được sinh theo từng request; chúng không nên cache phía server trừ khi thiết kế một chiến lược token chung sống ngắn.

URL gốc CDN và hàm signed URL là hai dạng URL duy nhất dùng trong response. Đường dẫn storage không bao giờ được trả thẳng cho client.

### Kế hoạch Caching

| Dữ liệu | Chiến lược | Vô hiệu hóa (Invalidation) |
|---|---|---|
| Các slug category object riêng biệt | `string[]` trong tiến trình nạp lúc khởi động; TTL 5 phút (kiểm tra TTL ở mỗi request, reload bất đồng bộ nếu cũ) | Khi hết TTL. Không có vô hiệu hóa theo sự kiện ở v1. |
| Các slug category material riêng biệt | Cùng cache trong tiến trình | Tương tự |
| ~~Ma trận tương thích~~ | **Đã loại bỏ theo Quyết định B** — tính tương thích nằm theo-từng-slot bên trong mỗi object (`materialSlots[].allowedCategories`), phân giải phía client. Không ma trận, không `warmupCompatibilityCache()`. | — |
| Các trang library object | Không cache phía server ở v1; trạng thái phân trang phía client xử lý | — |
| Dữ liệu project | Không cache phía server; dữ liệu cá nhân hóa và thay đổi thường xuyên | — |

Redis rõ ràng không có trong v1. Cache trong tiến trình đủ cho một instance API duy nhất và tránh overhead vận hành.
Nếu cần scale ngang, trích cache ra Redis ở thời điểm đó.

---

## 5. Kế hoạch Migration

Mọi migration là file SQL thuần trong `migrations/`. Runner (`migrations/run.ts`) theo dõi các migration đã áp dụng
trong một bảng `public.schema_migrations`. Mỗi migration chạy trong một transaction; thất bại sẽ rollback và dừng
runner kèm tên file thất bại.

Không bao giờ sửa một file migration đã áp dụng. Các sửa chữa đi vào một migration đánh số mới.

| File | Nội dung | DDL chính |
|---|---|---|
| `001_extensions_and_triggers.sql` | Bootstrap extension và trigger dùng chung | `CREATE EXTENSION IF NOT EXISTS` cho uuid-ossp, pgcrypto, citext, pg_trgm, unaccent; `CREATE OR REPLACE FUNCTION set_updated_at()` |
| `002_profiles.sql` | Bảng mở rộng profile người dùng | `CREATE TABLE public.profiles`, FK tới `auth.users`, trigger `trg_profiles_updated_at` |
| `003_projects.sql` | Bảng project | `CREATE TABLE public.projects` với `scene_data JSONB`, `deleted_at`, `is_template`, `is_public`; trigger `trg_projects_updated_at` |
| `004_autosaves_versions.sql` | Buffer autosave và lịch sử phiên bản | `CREATE TABLE public.project_autosaves`, `CREATE TABLE public.project_versions`, `CREATE OR REPLACE FUNCTION next_project_version()` |
| ~~`005_object_categories.sql`~~ | **Đã loại bỏ (Quyết định B)** — categories là chuỗi slug trên object, không phải bảng cây | — |
| `006_library_objects.sql` | Catalog library object (đặt khóa theo slug) | `CREATE TABLE public.library_objects` với `id TEXT PRIMARY KEY` (slug), `category TEXT`, `model_url`, `thumbnail_url`, `topdown_url`, `bounding_box JSONB`, `collision_box JSONB`, `material_slots JSONB`, `material_bindings JSONB`, `is_premium`, `is_active`, `search_vector TSVECTOR`, hàm trigger FTS + trigger. (Enum `placement_surface` chỉ nếu một trường `placement` được thêm vào catalog — kiểm tra.) |
| `007_material_categories.sql` | List category material (tùy chọn) | `CREATE TABLE public.material_categories` (danh sách slug) — hoặc bỏ qua để dùng `SELECT DISTINCT category` |
| `008_materials.sql` | Catalog material (đặt khóa theo slug) | `CREATE TABLE public.materials` với `id TEXT PRIMARY KEY` (slug), `category TEXT`, `icon_url`, `textures JSONB` (đường dẫn KTX2), `is_premium`, `is_active`, `search_vector TSVECTOR GENERATED ALWAYS AS (...) STORED` |
| ~~`009_compat_tables.sql`~~ | **Đã loại bỏ (Quyết định B)** — không có bảng hay hàm tương thích; tính tương thích nằm trong `library_objects.material_slots[].allowedCategories` | — |
| ~~`010_project_objects.sql`~~ | **Đã loại bỏ (Quyết định B)** — scene là một blob `scene_data` JSONB; không có registry object đã đặt | — |
| `011_sharing.sql` | Chia sẻ project | `CREATE TYPE share_permission AS ENUM ('viewer','commenter','editor')`, `CREATE TABLE public.project_shares` |
| `012_operations_log.sql` | Log thao tác (scaffold CRDT tương lai) | `CREATE TABLE public.project_operations PARTITION BY RANGE (applied_at)`, partition ban đầu `project_operations_2025_2026` cho khoảng `('2025-01-01')` đến `('2027-01-01')` |
| `013_indexes.sql` | Mọi index hiệu năng | Các câu lệnh `CREATE INDEX` bao phủ projects (`owner_id, updated_at DESC WHERE deleted_at IS NULL`), library_objects (category, FTS, trgm), materials (category, FTS, trgm), project_versions (`project_id, version_num DESC`), project_autosaves (`project_id, saved_at DESC`), project_shares. **Không** có index project_objects / category_material_compat / object_categories (Quyết định B). |
| `014_rls_policies.sql` | RLS enable + policy | Mọi câu lệnh `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` và `CREATE POLICY` từ Section 10 của spec |

### Cách tiếp cận Runner

`migrations/run.ts` là một script TypeScript thuần chạy bằng `tsx`:

1. Kết nối PostgreSQL dùng `DATABASE_URL` từ env.
2. Tạo `public.schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` nếu chưa tồn tại.
3. Đọc mọi file `*.sql` từ thư mục `migrations/` sắp xếp theo từ điển (tiền tố số đảm bảo thứ tự đúng).
4. Với mỗi file, kiểm tra `filename` có trong `schema_migrations` không. Bỏ qua nếu có.
5. Chạy nội dung file dưới dạng một lệnh `client.query(sql)` duy nhất bên trong `BEGIN / COMMIT`. Khi lỗi, `ROLLBACK` và thoát với mã khác 0 cùng tên file.
6. Khi thành công, chèn filename vào `schema_migrations`.

Cách này không cần ORM, không cần thư viện migration, và tạo diff dễ đọc trong version control.

---

## 6. Bảng API Surface

Mọi endpoint yêu cầu `Authorization: Bearer <supabase_jwt>` trừ khi ghi chú khác. "Owner" nghĩa là
`projects.owner_id = req.user.id`. "Share" nghĩa là một hàng `project_shares` hợp lệ chưa hết hạn cho
`req.user.id` hoặc một share token hợp lệ.

| # | Method | Path | Auth | Request Schema | Response Schema | Kỳ vọng RLS |
|---|---|---|---|---|---|---|
| 1 | GET | /health | None | — | `{ status, timestamp }` | Không RLS (không truy vấn DB) |
| 2 | GET | /docs/openapi.json | None | — | Tài liệu OpenAPI 3.1 | Không RLS |
| 3 | GET | /auth/me | JWT | — | `UserProfile` | profiles: SELECT hàng của mình |
| 4 | PATCH | /auth/me/profile | JWT | `{ displayName?, avatarUrl? }` | `UserProfile` | profiles: UPDATE hàng của mình |
| 5 | GET | /projects | JWT | `?cursor&limit&sort` | `{ data: Project[], nextCursor }` | projects: SELECT where owner_id = auth.uid() |
| 6 | POST | /projects | JWT | `{ name?, floorCount? }` | `Project` (201) | projects: INSERT với owner_id |
| 7 | GET | /projects/:id | JWT hoặc ShareToken | — | `ProjectMeta` | projects: SELECT (owner hoặc share) |
| 8 | PATCH | /projects/:id | JWT (owner) | `{ name?, thumbnailUrl?, isTemplate?, isPublic? }` | `ProjectMeta` | projects: UPDATE (owner) |
| 9 | DELETE | /projects/:id | JWT (owner) | — | 204 | projects: UPDATE deleted_at (owner) |
| 10 | POST | /projects/:id/restore | JWT (owner) | — | `ProjectMeta` | projects: UPDATE deleted_at (owner) |
| 11 | POST | /projects/:id/duplicate | JWT (owner) | — | `{ id, name }` (201) | projects: INSERT (sao chép một-hàng gồm cả scene_data) |
| 12 | GET | /projects/:id/scene | JWT hoặc ShareToken | — | `{ sceneData }` (giữ nguyên tham chiếu slug) | projects: SELECT scene_data |
| 13 | PUT | /projects/:id/scene | JWT (owner hoặc editor share) | `{ sceneData }` | `{ savedAt }` | projects: UPDATE scene_data |
| 14 | POST | /projects/:id/autosave | JWT (owner hoặc editor share) | `{ sceneData, clientId? }` | `{ id, savedAt }` (201) | project_autosaves: INSERT |
| 15 | GET | /projects/:id/autosave/latest | JWT (owner hoặc editor share) | — | `{ id, sceneData, savedAt, clientId }` | project_autosaves: SELECT |
| 16 | GET | /projects/:id/versions | JWT (owner hoặc share) | — | `{ data: VersionSummary[] }` | project_versions: SELECT |
| 17 | POST | /projects/:id/versions | JWT (owner) | `{ label? }` | `VersionSummary` (201) | project_versions: INSERT |
| 18 | GET | /projects/:id/versions/:vid | JWT (owner hoặc share) | — | `VersionDetail` (kèm sceneData) | project_versions: SELECT |
| 19 | POST | /projects/:id/versions/:vid/restore | JWT (owner) | — | `{ restoredAt }` | projects: UPDATE scene_data |
| 20 | GET | /library/categories | JWT | — | `{ data: string[] }` (slug category riêng biệt) | library_objects: SELECT DISTINCT category |
| 21 | GET | /library/objects | JWT | `?category&isPremium&cursor&limit` | `{ data: LibraryObject[], nextCursor }` | library_objects: SELECT chỉ active |
| 22 | GET | /library/objects/search | JWT | `?q&category&limit` | `{ data: LibraryObject[] }` | library_objects: SELECT chỉ active |
| 23 | GET | /library/objects/:slug | JWT | — | `LibraryObjectDetail` (gồm materialSlots/bindings/boundingBox) | library_objects: SELECT chỉ active |
| 24 | GET | /materials | JWT | `?category&cursor&limit` | `{ data: Material[], nextCursor }` | materials: SELECT chỉ active |
| 25 | GET | /materials/search | JWT | `?q&category&limit` | `{ data: Material[] }` | materials: SELECT chỉ active |
| 26 | GET | /materials/:slug | JWT | — | `MaterialDetail` (URL texture KTX2 đã phân giải) | materials: SELECT chỉ active |
| ~~27~~ | ~~GET~~ | ~~/materials/compatible/:objectId~~ | — | — | **Đã loại bỏ (Quyết định B)** — tính tương thích phân giải phía client từ `materialSlots[].allowedCategories` | — |
| 28 | GET | /projects/:id/share | JWT (owner) | — | `{ data: Share[] }` | project_shares: SELECT |
| 29 | POST | /projects/:id/share | JWT (owner) | `{ sharedWith?, permission, expiresAt? }` | `Share` (201) | project_shares: INSERT |
| 30 | PATCH | /projects/:id/share/:shareId | JWT (owner) | `{ permission?, expiresAt? }` | `Share` | project_shares: UPDATE |
| 31 | DELETE | /projects/:id/share/:shareId | JWT (owner) | — | 204 | project_shares: DELETE |
| 32 | GET | /share/:token | None hoặc JWT | — | `{ projectMeta, permission }` | project_shares: SELECT theo token |
| 33 | POST | /ai/chat | **devOnly hôm nay → JWT (RQ-0)** | `{ system?, tools?, turns, maxTokens? }` | `{ text, toolCalls, finishReason }` | Không DB (proxy Gemini). Bị rate-limit. |

---

## 7. Chiến lược kiểm thử

### Loại test theo từng giai đoạn

| Phase | Unit Test | Integration Test | Ghi chú |
|---|---|---|---|
| 0 | Lớp lỗi, `toCamel`, logic `withTransaction` | Endpoint health, auth middleware với JWT giả | Mock pool client cho unit test withTransaction |
| 1 | Logic sắp xếp file của migration runner | Chạy migration trên một test DB | Dùng một test DB riêng (ví dụ Supabase local dev qua `supabase start`) |
| 2 | auth.service (logic upsert/sync) | GET /auth/me end-to-end | Test với một JWT thật từ Supabase test project |
| 3 | Logic sở hữu projects.service, dựng cursor | Mọi endpoint CRUD projects | Bao gồm test transaction duplicate |
| 4 | Validate `version` + passthrough của scenes.service | Round-trip lưu/tải scene (test quan trọng nhất) | Xác minh blob deep-equals qua cả vòng; slug không bị biến đổi |
| 5 | prune-giữ-5 của autosave.service | POST /autosave × 6 → khẳng định còn 5 hàng | Test tính nguyên tử của transaction |
| 6 | version_num tự tăng của versions.service | Vòng tạo + khôi phục version | Restore một-hàng; khẳng định scene_data bằng snapshot |
| 7 | Gating premium, phân giải URL, pass-through slug của library.service | Duyệt library theo slug category, search FTS, search trigram | Cần dữ liệu catalog đã seed |
| 8 | Phân giải URL (icon + textures KTX2) của materials.service | List/lọc material theo slug category, search FTS + trgm | Materials đã seed; không có test compat (Quyết định B) |
| 9 | Sinh token, kiểm tra hết hạn của sharing.service | Tạo share + truy cập qua token | Test token hết hạn → 403 |
| 10 | — | Bộ integration test đầy đủ + test rate limiter | Mục tiêu báo cáo coverage: 80%+ |

### Hạ tầng test

- **Test runner**: Vitest (nhanh, hỗ trợ TypeScript native, tương thích CommonJS qua transform `tsx`).
- **Test database**: Instance phát triển local của Supabase (`supabase start`). Mỗi test suite chạy migration tới schema sạch khi bắt đầu chạy test. Không dùng database production hay staging cho test.
- **Fixtures**: Thư mục `tests/fixtures/` chứa các script seed SQL cho: một profile test user, ba project, một catalog nhỏ đặt khóa theo slug gồm 10 library object qua hai category (mỗi cái có `materialSlots`), và 5 material qua các slug category liên quan. Không có fixture ma trận compat (Quyết định B).
- **HTTP testing**: Dùng `supertest` đối với instance app Express (không cần cổng server sống). Import `createApp()` từ `app.ts` và truyền vào `supertest(app)`.
- **JWT mocking**: Trong test, sinh một JWT test hợp lệ ký bằng cùng `SUPABASE_JWT_SECRET` từ môi trường test. Không dùng credential người dùng thật trong CI.

### Các test case quan trọng (không được bỏ qua)

1. **Round-trip lưu/tải scene**: PUT /projects/:id/scene với một blob `scene_data` thực tế (gồm furniture, wallItems, floors, materialFaces), rồi GET /projects/:id/scene — khẳng định blob trả về deep-equals blob đã gửi, và mọi tham chiếu slug object/material giống hệt từng byte (không bị biến đổi).
2. **Sao chép khi nhân bản**: POST /projects/:id/duplicate — khẳng định `scene_data` của project mới deep-equals của bản gốc; khẳng định project gốc không đổi. (Sao chép một-hàng — không lo transaction/mồ côi theo Quyết định B.)
3. **Prune autosave**: 6 lệnh POST /autosave liên tiếp — khẳng định đúng 5 hàng trong project_autosaves cho project đó.
4. **Khôi phục version**: POST /versions/:vid/restore rồi GET /projects/:id/scene — khẳng định `scene_data` bằng snapshot. (UPDATE một-hàng — không có tính nguyên tử đa-bảng để test theo Quyết định B.)
5. **Hết hạn share token**: Tạo một share với `expiresAt = now - 1 phút` — khẳng định GET /projects/:id/scene với token đó trả về 403.

---

## 8. Rủi ro và câu hỏi mở

Các mục sau đây mơ hồ trong spec hiện tại và phải được quyết định trước hoặc trong khi triển khai. Chúng được
liệt kê theo thứ tự giải quyết khuyến nghị.

> **Bị thay thế bởi phần Điều chỉnh (Section 0):** RQ-5 giờ cố định ở Option A (scene là JSONB opaque).
> Bất kỳ câu hỏi mở nào tham chiếu `project_objects`, các bảng tương thích, hay định danh UUID catalog
> đều vô nghĩa — xem Quyết định A và B.

### RQ-0: Supabase Auth của Frontend chưa tồn tại (BLOCKER — GIẢI QUYẾT TRƯỚC PHASE 2 / PHASE 11 PROD)

**Câu hỏi**: Toàn bộ kế hoạch này giả định mọi request mang một Supabase JWT mà Express verify.
Nhưng frontend hiện **không có cơ chế lấy một Supabase token** — xác nhận bởi
`domains/ai/ai.routes.ts`, vốn ship một guard `devOnly` không xác thực chính vì lý do này
("FE hiện chưa có cơ chế lấy Supabase token"). Cho đến khi frontend đấu nối Supabase Auth (login →
access token → `Authorization: Bearer` trên mọi request), **không endpoint đã xác thực nào có thể
chạy end-to-end**, và `POST /ai/chat` phải giữ dev-only / disable ở production.

**Tác động**: Tiêu chí nghiệm thu Phase 2 (auth) ("Supabase JWT hợp lệ trả về 200") không thể đáp ứng từ
client thật; chúng chỉ có thể test bằng một JWT test ký tay. Domain AI không thể bật ở production.
Projects/scenes/versions không dùng được từ app thật cho đến khi xong việc này.

**Khuyến nghị**: Coi việc đấu nối Supabase Auth của frontend là một **track tiên quyết chạy song song
với Phase 0–2**. Cụ thể ở frontend: thêm một Supabase client, một luồng login, lưu session, và inject
`Authorization: Bearer <token>` trong lớp API (hiện đang trống) `01-frontend/src/app/services/`.
Cho đến khi đó, gate mọi route đã xác thực sau cùng một tư thế dev-only mà route AI đã dùng, và dựa vào
JWT test ký tay cho các integration test backend.

### RQ-1: Cách tiếp cận verify JWT (GIẢI QUYẾT TRƯỚC PHASE 0)

**Câu hỏi**: API nên verify Supabase JWT qua:
- (A) HS256 đối xứng dùng `SUPABASE_JWT_SECRET` từ env, hay
- (B) RS256 bất đối xứng qua endpoint JWKS của Supabase (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) với key caching?

**Tác động**: Option A đơn giản hơn để triển khai (một env var, `jsonwebtoken.verify(token, secret)`). Option B an toàn hơn (secret không bao giờ lưu trong env) nhưng cần fetch JWKS với caching và xử lý xoay key. Mặc định Supabase là HS256; RS256 cần Supabase Pro plan với custom JWT settings.

**Khuyến nghị**: Dùng Option A (HS256) cho v1. Ghi lại đường nâng cấp lên Option B khi dự án mở rộng vượt một team duy nhất.

### RQ-2: `plan` của user trong JWT so với DB (GIẢI QUYẾT TRƯỚC PHASE 0)

**Câu hỏi**: `req.user.plan` (dùng cho gating premium ở Phase 7) nên đến từ:
- (A) Một custom Supabase JWT claim (`app_metadata.plan`) đặt khi plan của user thay đổi, hay
- (B) Một lookup DB tới `profiles.plan` trên mỗi request đã xác thực?

**Tác động**: Option A tránh một truy vấn DB mỗi request nhưng cần cấu hình Supabase Auth hook để giữ claim đồng bộ khi plan thay đổi. Option B luôn tươi mới nhưng thêm 1 vòng DB mỗi request (giảm thiểu bằng cách cache profile trong `req`).

**Khuyến nghị**: Cho v1, dùng Option B với một cache profile đơn giản trong-request (`req.user` được populate bởi một SELECT trong auth middleware). Thay đổi plan hiếm và không đáng để gánh độ phức tạp của JWT hook ở giai đoạn này.

### RQ-3: Hành vi gating premium (GIẢI QUYẾT TRƯỚC PHASE 7)

**Câu hỏi**: Khi một user trên plan `free` request `GET /library/objects` hoặc `GET /materials`, các mục premium nên:
- (A) Loại trừ hoàn toàn khỏi kết quả, hay
- (B) Bao gồm nhưng đánh cờ `isPremium: true` để UI hiển thị icon "khóa"?

**Tác động**: Option B có UX tốt hơn (cho user thấy họ đang thiếu gì). Option A đơn giản hóa truy vấn. Spec nói `is_premium` tồn tại nhưng không nêu rõ hành vi áp đặt.

**Khuyến nghị**: Trả về mọi object (Option B) với cờ `isPremium`. Để frontend render khóa. Nếu user cố đặt một premium object và API cần áp đặt phía server, thêm một kiểm tra trong handler PUT scenes.

### RQ-4: Chiến lược prune autosave — Giữ-5-bản-cuối vs. Giới hạn theo giờ (GIẢI QUYẾT TRƯỚC PHASE 5)

**Câu hỏi**: Spec nói "giữ 5 autosave cuối cho mỗi project". Comment stub `autosave.service.ts` nói "hourly limit". Đây là hai ràng buộc khác nhau (rate limit theo giờ trên endpoint VÀ giữ-5-bản-cuối), hay chỉ một cái áp dụng?

**Tác động**: Nếu cả hai áp dụng, triển khai cần cả một rate limiter trên endpoint và một prune-khi-insert. Nếu chỉ giữ-5-bản-cuối áp dụng, ghi chú giới hạn theo giờ là nhiễu. Quyết định trước khi triển khai Phase 5.

**Khuyến nghị**: Triển khai prune giữ-5-bản-cuối (theo spec). Áp dụng rate limiter chuẩn `autosaveLimiter` (ví dụ 120 req/giờ = 2/phút) lên endpoint như một biện pháp chống lạm dụng tách biệt với logic prune.

### RQ-5: Validate scene_data phía server (ĐÃ GIẢI QUYẾT → Option A, theo Quyết định B)

**Câu hỏi**: API có nên validate hình dạng của `scene_data` JSONB trước khi ghi không?

**Phương án**:
- (A) Tin client; chỉ verify trường top-level `{ version: number }` có mặt.
- (B) Validate đầy đủ bằng Zod schema cho `scene_data` gồm mảng floors, nodes, walls.

**Tác động**: Option B ngăn dữ liệu scene hỏng được ghi vào nhưng gắn kết API schema với định dạng scene đang tiến hóa của editor frontend — mỗi thay đổi scene schema cần một lần deploy API. Option A linh hoạt hơn nhưng cho phép dữ liệu dị dạng vào DB.

**Khuyến nghị**: Option A cho v1. Chỉ validate rằng `scene_data` là một JSON object với một trường `version` kiểu số. Log warning nếu có các khóa top-level không xác định. Xem lại nếu phát sinh vấn đề hỏng dữ liệu.

### RQ-6: Chiến lược Signed URL cho tài nguyên premium (GIẢI QUYẾT TRƯỚC PHASE 7)

**Câu hỏi**: URL model của library object premium nên trả về dưới dạng signed URL (giới hạn thời gian, cần auth) hay public CDN URL?

**Tác động**: Signed URL ngăn nội dung premium bị truy cập mà không có session hợp lệ, nhưng chúng hết hạn và không thể cache bởi browser client. Public URL có thể cache nhưng phơi bày file model premium cho bất kỳ ai biết URL.

**Khuyến nghị**: Dùng signed URL cho file model premium (object `is_premium = true`). Dùng public CDN URL cho object không-premium và mọi texture material. Hết hạn signed URL nên đủ dài để hoàn thành một session (ví dụ 4 giờ) và được sinh lại khi tải scene.

### RQ-7: Tương thích khi viết lại `app.ts`

**Câu hỏi**: `app.ts` hiện tại dùng kiểu CommonJS `require()` và tham chiếu `./middleware/CorsMiddleware` và `./routes` không tồn tại trong cấu trúc mới. Chúng phải được thay thế. Xác nhận không có frontend hay service nào khác đang gọi một route đăng ký trong module `./routes` cũ.

**Khuyến nghị**: Xác nhận với team rằng không client hiện tại nào phụ thuộc vào bất kỳ route nào trong `app.ts` hiện tại trước khi viết lại. Nếu dự án là greenfield (chưa có phiên bản deploy nào), tiến hành viết lại toàn bộ ngay.

### RQ-8: Không nhất quán đặt tên `sharing.services.ts`

File `domains/sharing/sharing.services.ts` dùng hậu tố số nhiều `services`, khác với mọi domain khác (`*.service.ts`). Nên đổi tên thành `sharing.service.ts` trước khi viết bất kỳ code nào trong nó. Xác nhận việc đổi tên này sẽ không phá vỡ import hiện có.

### RQ-9: Domain `versions` — Thiếu `versions.schema.ts`

Thư mục `domains/versions/` không có file `versions.schema.ts` (khác với mọi domain khác). Một `CreateVersionSchema` (trường label) phải được tạo trong file này trong Phase 6. Không file hiện có nào cần đổi tên; file chỉ cần được tạo.

### RQ-10: Khoảng ngày Partition của Migration

Migration `012_operations_log.sql` tạo một partition `project_operations_2025_2026` cho khoảng `('2025-01-01')` đến `('2027-01-01')`. Vì ngày hiện tại là 2026-05-20, partition này đã active. Một partition mới `project_operations_2027_2028` nên được tạo trước tháng 1 năm 2027. Thêm một nhắc lịch hoặc một kiểm tra lúc khởi động trong `server.ts` để cảnh báo khi ngày hiện tại trong vòng 60 ngày trước cận trên của partition hiện tại.

---

## 9. Ước lượng công sức

Định cỡ: S = nửa ngày hoặc ít hơn; M = 1–2 ngày; L = 3–4 ngày.

| Phase | Mô tả | Công sức |
|---|---|---|
| 0 | Nền móng (env, db, middleware, shared/) | L |
| 1 | Migration runner + SQL 001–002 | M |
| 2 | Auth domain (đồng bộ profile, GET/PATCH /auth/me) | S |
| 3 | Projects domain (CRUD, phân trang, duplicate) | L |
| 4 | Scenes domain (load/save, bulk upsert, transaction) | L |
| 5 | Autosave domain (insert + prune) | S |
| 6 | Versions domain (snapshot, list, restore) | M |
| 7 | Library domain (FTS, trgm, phân trang cursor) | L |
| 8 | Materials domain (catalog đặt khóa theo slug, lọc category, FTS — không compat) | S |
| 11 | AI domain (đã triển khai; gắn thêm auth + rate limit) | S |
| 9 | Sharing domain (named + link, token, hết hạn) | M |
| 10 | Hardening (RLS, rate limit, OpenAPI, tests) | L |

**Tổng công sức ước lượng**: khoảng 6–8 tuần-người cho một lập trình viên làm toàn thời gian, bao gồm testing.
Phase 0, 3, 4, 7, và 10 là các khoản đầu tư lớn nhất.

Đường tới hạn (critical path) là: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4. Mọi thứ sau Phase 4 có thể
được phát triển theo thứ tự bất kỳ tương đối với nhau, vì chúng chỉ chia sẻ auth middleware và pool làm phụ thuộc cứng.

---

*Kế hoạch được viết dựa trên spec `DATABASE_ARCHITECTURE.md` tính đến 2026-05-20. Điều chỉnh 2026-06-16 (Section 0) để tái căn chỉnh với mô hình dữ liệu frontend thực tế: catalog đặt khóa theo slug (Quyết định A), một blob `scene_data` JSONB duy nhất không có `project_objects` và không có bảng tương thích (Quyết định B), cùng domain AI đã triển khai và blocker auth frontend (Quyết định C). Chỗ nào nội dung thân bài mâu thuẫn với Section 0, Section 0 thắng. Giải quyết mọi câu hỏi mở đánh dấu "GIẢI QUYẾT TRƯỚC PHASE N" — đặc biệt RQ-0 — trước khi bắt đầu giai đoạn đó.*
