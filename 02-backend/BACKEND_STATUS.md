# Backend — Báo cáo tình hình hiện tại

> Cập nhật: 2026-06-16 · Nhánh: `feature/tntien/draw2d_v1` · Thư mục: `3D-HomeVerse/02-backend/`
> Tài liệu này tổng hợp **trạng thái thực tế** của backend sau đợt reconcile theo Amendments
> (Mục 0, Decisions A/B/C của `BACKEND_PLAN.md`).

---

## 1. TL;DR

- Backend **đã được implement đầy đủ cả 11 phase** từ trước — KHÔNG phải code mới từ đầu.
- Phần "Current State Audit" (Mục 2 trong `BACKEND_PLAN.md`) bị **lỗi thời nặng**: nó mô tả mọi file
  là rỗng/stub, nhưng thực tế mọi file đã có code thật.
- Code cũ viết theo **data model CŨ** (UUID-keyed catalog, có `project_objects`, có bảng
  compatibility). Amendments (ngày 2026-06-16) là **override bắt buộc** yêu cầu **gỡ bỏ** những phần đó.
- Đã hoàn tất reconcile theo Decisions A/B/C trong 4 đợt (chunk), mỗi đợt verify `tsc`.
- **Kết quả kiểm tra**: `npx tsc --noEmit` → **0 lỗi**; `npx vitest run` → **16 pass (2 file)**.

---

## 2. Những gì đã thay đổi (reconcile theo Amendments)

### Decision B — Bỏ `project_objects` (scene = 1 blob JSONB duy nhất)
- `scenes.repository.ts` / `scenes.service.ts`: load = 1 câu `SELECT`, save = 1 câu `UPDATE`
  (bỏ mảng `objects`, bỏ transaction). Gỡ `bulkUpsertObjects`, `deleteRemovedObjects`, `copyProjectObjects`.
- `scenes.schema.ts` / `scenes.types.ts`: body chỉ còn `{ sceneData }` (validate đúng `version: number`, passthrough).
- `projects.service.duplicateProject`: chuyển thành **copy 1 dòng** (kèm `scene_data`), `RETURNING id, name`, bỏ transaction.
- `versions.repository.restoreVersion`: chỉ còn 1 câu `UPDATE` copy `scene_data` ngược lại; bỏ bước xoá `project_objects`; bỏ transaction ở service.
- Xoá migration `010_project_objects.sql`; gỡ index/RLS của `project_objects` khỏi `013`/`014`; gỡ schema `ProjectObject` khỏi OpenAPI.

### Decision B — Bỏ toàn bộ hệ compatibility
- Gỡ in-memory compat cache + `warmupCompatibilityCache()` (và lời gọi trong `server.ts`),
  `getCompatibleMaterials()`, các query compat trong repository, endpoint `GET /materials/compatible/:objectId`, và entry tương ứng trong OpenAPI.
- Xoá migration `005_object_categories.sql` và `009_compat_tables.sql`; gỡ index/RLS compat + `object_categories`.
- Lý do: compatibility đã nằm sẵn theo từng slot trong `library_objects.material_slots[].allowedCategories`, resolve ở phía client.

### Decision A — Catalog định danh bằng **slug** (không phải UUID)
- `library_objects` và `materials`: `id TEXT PRIMARY KEY` (chính là slug catalog), `category TEXT` (slug).
- `library_objects` lưu thêm: `topdown_url`, `bounding_box`, `collision_box`, `material_slots`, `material_bindings`.
- `materials` lưu: `icon_url` + `textures` JSONB (`color/normal/roughness/ao` — đường dẫn KTX2).
- Viết lại migration `006`/`008`; xoá bảng UUID `material_categories` (`007`) — category lấy bằng `SELECT DISTINCT category`.
- Viết lại 2 domain `library` + `materials` (types/schema/repository/service/routes) theo slug; cập nhật OpenAPI (`{id}`→`{slug}`, `categoryId`→`category`).
- Slug bên trong `scene_data` được **giữ nguyên** khi đọc/ghi (API không bao giờ rewrite).

### Tài liệu
- `BACKEND_PLAN.md` Mục 2: thêm hộp trạng thái chính xác (ngày 2026-06-16); phần audit cũ được giữ lại và đánh dấu **HISTORICAL**.

---

## 3. Trạng thái theo domain

| Domain | Trạng thái | Ghi chú |
|---|---|---|
| auth | Implemented | profile sync + GET/PATCH `/auth/me` (có thêm route register dùng cho test) |
| projects | Implemented + reconciled | duplicate = copy 1 dòng |
| scenes | Implemented + reconciled | save/load = 1 dòng, blob JSONB |
| autosave | Implemented | insert + prune keep-last-5 (transaction duy nhất còn lại) |
| versions | Implemented + reconciled | restore = 1 câu UPDATE |
| library | Rewritten (slug) | category = slug, FTS + trigram |
| materials | Rewritten (slug + textures) | bỏ compat hoàn toàn |
| sharing | Implemented | named + link share, token, expiry |
| ai | Implemented | proxy Gemini, đang gác `devOnly` (chặn ở production) |

---

## 4. Tình trạng migration

Bộ migration hiện tại (runner forward-only, chấp nhận khoảng trống số thứ tự):

```
001_extensions_and_triggers.sql
002_profiles.sql
003_projects.sql
004_autosaves_versions.sql
006_library_objects.sql      (viết lại — slug)
008_materials.sql            (viết lại — slug + textures)
011_sharing.sql
012_operations_log.sql
013_indexes.sql              (đã gỡ index project_objects/compat/object_categories)
014_rls_policies.sql         (đã gỡ RLS project_objects/compat/object_categories/material_categories)
```

Đã xoá có chủ đích: `005, 007, 009, 010`.

> ✅ **Migration ĐÃ được apply** (2026-06-17) lên project Supabase `yzhnlgucivkaurkrjxsp`
> (region `ap-southeast-2`). `schema_migrations` ghi nhận đủ 10 version:
> `001, 002, 003, 004, 006, 008, 011, 012, 013, 014`. RLS bật trên mọi bảng người dùng;
> tổng 32 index. Verify lại bằng `npm run db:migrate` → "No pending migrations".

**Hai việc phát sinh khi apply (đã xử lý):**

1. **DNS — local resolver REFUSE `*.pooler.supabase.com`**: máy hiện tại trả `DNS operation refused`
   cho host pooler (dù public DNS 1.1.1.1 resolve bình thường → region đúng). Vì `pg` đi qua
   `net.connect` (dùng OS resolver `dns.lookup`, không thể trỏ server khác như `dns.Resolver`), đã thêm
   `configs/dns-fix.ts`: monkey-patch `dns.lookup` để **chỉ** resolve host `*.supabase.com/.co` qua
   public DNS (`1.1.1.1`/`8.8.8.8`, override bằng `DNS_FALLBACK_SERVERS`), mọi host khác + mọi lỗi đều
   fallback về OS resolver. Import đầu `configs/database.ts` trước khi tạo pool. Supavisor route theo
   username (`postgres.<ref>`) nên kết nối ổn định kể cả khi IP pooler đổi.

2. **DB còn rác từ lần chạy migration CŨ**: tồn tại orphan enum `share_permission`, `placement_surface`
   và bảng `project_operations` (0 row) → đã `DROP` rồi chạy lại. Đồng thời sửa **lỗi thật trong `012`**:
   PRIMARY KEY của bảng partitioned phải chứa cột phân vùng → đổi `id PRIMARY KEY` thành
   `PRIMARY KEY (id, applied_at)`.

---

## 5. Kiểm chứng

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **16 passed (2 files)** — `tests/health.test.ts`, `tests/auth.register.test.ts`
- Quét toàn bộ code + migration tìm tham chiếu sót (`project_objects`, `compat`, `object_categories`,
  `category_id`, `placement`, …) → sạch (chỉ còn comment / slug hợp lệ).

---

## 6. Điểm chặn & việc còn lại

- **RQ-0 (BLOCKER)**: Frontend **chưa có cơ chế lấy Supabase JWT** → chưa thể chạy end-to-end endpoint
  nào cần auth; `POST /ai/chat` phải giữ `devOnly`. Cần wire Supabase Auth ở FE (login → access token →
  `Authorization: Bearer` cho mọi request).
- ~~**DB chưa sẵn sàng**~~ → **ĐÃ XONG (2026-06-17)**: project Supabase `yzhnlgucivkaurkrjxsp` đã cấu hình,
  `properties.dev.env` có đủ key thật, `npm run db:migrate` đã apply toàn bộ schema (xem Mục 4).
  Còn thiếu: **seed catalog** (`library_objects` + `materials` đang rỗng) để API library/materials trả data.
- **Phase 10 (Hardening)**: RLS/rate-limit/OpenAPI đã có; cần bộ integration test đầy đủ (mục tiêu coverage 80%)
  một khi có DB test (Supabase local).
- **Đề xuất nhỏ**: cân nhắc thống nhất shape `topDown` khi FE chuyển sang gọi API (hiện trả phẳng
  `topdownUrl`; catalog FE đang dùng `topDown.imageUrl`).

---

## 7. Trạng thái Git (chưa commit)

Các file đã sửa/đổi (chưa commit; 3 migration đã `git rm`):

- **Sửa**: `server.ts`, `shared/openapi/openapi.ts`, `BACKEND_PLAN.md`,
  `domains/{scenes,projects,versions,library,materials}/*`, `migrations/{006,008,013,014}`
- **Xoá**: `migrations/{005,007,009,010}`
- **Mới**: `BACKEND_STATUS.md` (file này), `BACKEND_PLAN.vi.md`

> Chưa tạo commit — chờ xác nhận message/phạm vi.
