# Backend Implementation Plan — 3D Interior Design v1.0

> Source of truth for the phased delivery of the Express.js backend.
> All paths in this document are relative to `3D-HomeVerse/02-backend/` unless stated otherwise.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Audit](#2-current-state-audit)
3. [Phased Delivery Plan](#3-phased-delivery-plan)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [Migration Plan](#5-migration-plan)
6. [API Surface Table](#6-api-surface-table)
7. [Testing Strategy](#7-testing-strategy)
8. [Risks and Open Questions](#8-risks-and-open-questions)
9. [Estimated Effort](#9-estimated-effort)

---

## 1. Executive Summary

### Scope

This plan covers the full implementation of the Express.js REST API that sits between the React Three Fiber frontend and the Supabase-hosted PostgreSQL database. The API is the sole trust boundary for all authenticated mutations. It handles JWT verification, business rule enforcement, transaction coordination, and structured error responses.

Domains in scope:

- Auth (profile sync, self-service profile read/update)
- Projects (CRUD, soft-delete, cursor-paginated list, atomic duplication)
- Scenes (full scene load and save with bulk project_objects upsert)
- Autosave (insert + prune-keep-last-5)
- Versions (immutable snapshot create, list, restore)
- Library (object catalog search, filter, cursor pagination)
- Materials (catalog search, material picker for a given object)
- Sharing (named-user shares, link shares with token, expiry, revocation)
- Hardening (RLS enforcement, rate limiting, OpenAPI documentation, integration tests)

### Non-Goals

- No reimplementation of Supabase Auth (registration, login, email verification, token refresh). Those flows hit Supabase Auth directly from the frontend. The backend only consumes the resulting JWT.
- No PostgREST exposure for frontend write paths.
- No real-time collaboration (Supabase Realtime, CRDT merge logic). The schema is ready; the feature is deferred.
- No admin panel or content management UI for the library catalog.
- No payment / subscription billing logic beyond reading the `plan` column on `profiles`.

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 18+ (LTS) | Stable, async-friendly, wide ecosystem |
| Framework | Express 5 (already in package.json) | Minimal, well-understood, already installed |
| Language | TypeScript (strict mode, ES2020 target) | Already configured in tsconfig.json |
| DB client | node-postgres (`pg`) | Already installed; no ORM overhead |
| Validation | Zod | Schema-first, integrates cleanly with TypeScript inference |
| Auth | Supabase JWT (JWKS or shared secret — see Open Questions) | Avoids reimplementing auth |
| Storage | Supabase Storage via `@supabase/storage-js` | CDN-served binary assets |
| Logging | pino (already in package.json) | Structured JSON logs, low overhead |
| Migrations | Plain numbered SQL files + custom runner script | No ORM; matches spec Section 11 |

### Architectural Boundaries

Express is the primary authorization layer. It verifies every JWT, checks ownership / share permissions in the service layer, and only then issues SQL. RLS on PostgreSQL is a defense-in-depth backstop — it must not be relied upon as the sole authz gate.

The `service_role` Supabase key is held only by the Express process, never exposed to the client. All mutations go through the API.

---

## 2. Current State Audit

### File Inventory

The following table describes every non-`node_modules` file found under `02-backend/` at the time of this audit.

Legend: **Empty** = file has 0–1 lines (exists but contains nothing actionable); **Stub** = file contains a single-line comment naming its purpose; **Scaffolded** = file has meaningful structure but no implementation; **Implemented** = file is functionally complete.

#### Root Files

| File | State | Notes |
|---|---|---|
| `app.ts` | Scaffolded | Uses `require()` CommonJS style; mounts a `./routes` module and a `./middleware/CorsMiddleware` that do not exist in the new structure. Needs full rewrite to TypeScript ESM-compatible import style, correct middleware stack, and domain router mounting. |
| `server.ts` | Empty | Single blank line. Needs entry-point implementation: import app, call `app.listen`. |
| `package.json` | Implemented | Dependencies installed: `express`, `pg`, `pino`, `helmet`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `cors`, `date-fns`, `dotenv`, `nodemon`, `tsx`, `typescript`. Missing: `zod`, `@supabase/supabase-js` (for auth JWT verify and storage), `pino-http` (request logger). Dev dependencies missing: `@types/pg`, `@types/cookie-parser`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcryptjs`, test runner (`vitest` or `jest`). |
| `tsconfig.json` | Implemented | Correct settings (strict, ES2020, commonjs). No changes needed. |
| `properties.dev.env` | Scaffolded | Contains legacy Postgres connection fields (`POSTGRE_HOST`, `POSTGRE_USER`, etc.) and `SERVER_PORT`. Missing all Supabase fields: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_CDN_URL`, `NODE_ENV`. Needs updating to the Supabase-based connection model. |

#### `configs/`

| File | State | Notes |
|---|---|---|
| `configs/env.ts` | Stub | Comment only. Full Zod-validated env schema needed. |
| `configs/database.ts` | Stub | Comment only. pg Pool singleton + Supabase client needed. |
| `configs/storage.ts` | Stub | Comment only. Supabase Storage client init needed. |

Note: the spec uses `config/` (singular). The existing scaffold uses `configs/` (plural). The plan preserves `configs/` to avoid renaming existing files.

#### `middleware/`

| File | State | Notes |
|---|---|---|
| `middleware/auth.ts` | Stub | Comment only. JWT verification + `req.user` attachment needed. |
| `middleware/errorHandler.ts` | Stub | Comment only. AppError-to-HTTP mapping needed. |
| `middleware/requestLogger.ts` | Stub | Comment only. pino-http integration needed. |
| `middleware/validate.ts` | Stub | Comment only. Zod middleware factory needed. |

Note: `app.ts` references a `middleware/CorsMiddleware` that does not exist as a stub. This will be replaced by the standard `cors` package configuration inside `app.ts`.

#### `shared/db/`

| File | State | Notes |
|---|---|---|
| `shared/db/client.ts` | Empty | Needs pg Pool export. |
| `shared/db/transaction.ts` | Empty | Needs `withTransaction` helper (spec provides exact implementation). |
| `shared/db/queryHelper.ts` | Empty | Needs camelCase mapper and typed query wrapper. Note: spec names this `queryHelpers.ts` (plural); existing file is `queryHelper.ts` (singular). Keep singular form. |

#### `shared/errors/`

| File | State | Notes |
|---|---|---|
| `shared/errors/AppError.ts` | Empty | Base error class with `statusCode` needed. |
| `shared/errors/NotFoundError.ts` | Empty | Extends AppError, HTTP 404. |
| `shared/errors/ForbiddenError.ts` | Empty | Extends AppError, HTTP 403. |
| `shared/errors/ValidationError.ts` | Empty | Extends AppError, HTTP 422. |

#### `shared/storage/` and `shared/types/`

| File | State | Notes |
|---|---|---|
| `shared/storage/storageClient.ts` | Empty | Supabase Storage helpers needed. |
| `shared/types/express.d.ts` | Empty | `req.user` type augmentation needed. |
| `shared/types/supabase.ts` | Empty | Generated Supabase types (run after migrations). |

#### `domains/auth/`

| File | State | Notes |
|---|---|---|
| `domains/auth/auth.routes.ts` | Stub | Single comment: "POST /auth/register, /auth/login, /auth/verify-email". These flows belong to Supabase Auth, not this API. The actual routes are GET /auth/me and PATCH /auth/me/profile. Routes file needs rewrite. |
| `domains/auth/auth.service.ts` | Stub | Comment: "register, login, verifyEmail, refreshToken logic". Scope must shift to profile-sync and self-service update only. |
| `domains/auth/auth.repository.ts` | Stub | profiles table queries. Needs implementation. |
| `domains/auth/auth.schema.ts` | Stub | Zod schemas needed. |
| `domains/auth/auth.types.ts` | Stub | TypeScript types needed. |

#### `domains/projects/`

| File | State | Notes |
|---|---|---|
| `domains/projects/projects.routes.ts` | Empty | Needs full implementation. |
| `domains/projects/projects.service.ts` | Empty | Needs full implementation. |
| `domains/projects/projects.repository.ts` | Empty | Needs full implementation. |
| `domains/projects/projects.schema.ts` | Empty | Needs Zod schemas. |
| `domains/projects/projects.types.ts` | Empty | Needs TypeScript types. |

#### `domains/scenes/`

| File | State | Notes |
|---|---|---|
| `domains/scenes/scenes.routes.ts` | Empty | Needs full implementation. |
| `domains/scenes/scenes.service.ts` | Empty | Needs full implementation. |
| `domains/scenes/scenes.repository.ts` | Empty | Needs bulk upsert implementation. |
| `domains/scenes/scenes.schema.ts` | Empty | Needs SceneData and ProjectObject Zod schemas. |
| `domains/scenes/scenes.types.ts` | Empty | Needs TypeScript types. |

#### `domains/autosave/`

| File | State | Notes |
|---|---|---|
| `domains/autosave/autosave.routes.ts` | Empty | Needs full implementation. |
| `domains/autosave/autosave.service.ts` | Stub | Comment: "insert + prune logic (hourly limit)". Note the mention of "hourly limit" — spec says keep-last-5, not hourly. Decide which behavior is correct (see Open Questions). |
| `domains/autosave/autosave.repository.ts` | Stub | Comment lists correct routes. Needs implementation. |
| `domains/autosave/autosave.types.ts` | Empty | Needs TypeScript types. |

#### `domains/versions/`

| File | State | Notes |
|---|---|---|
| `domains/versions/version.routes.ts` | Empty | Needs full implementation. Note filename is `version.routes.ts` (singular), all other files in the folder are `versions.*`. Keep singular for routes to match existing stub. |
| `domains/versions/versions.service.ts` | Empty | Needs full implementation. |
| `domains/versions/versions.repository.ts` | Empty | Needs full implementation. |
| `domains/versions/version.types.ts` | Empty | Needs TypeScript types. Note: `versions.schema.ts` is absent — needs creation. |

#### `domains/library/`

| File | State | Notes |
|---|---|---|
| `domains/library/library.routes.ts` | Empty | Needs full implementation. |
| `domains/library/library.service.ts` | Empty | Needs full implementation. |
| `domains/library/library.repository.ts` | Empty | Needs FTS + trgm cursor-pagination queries. |
| `domains/library/library.schema.ts` | Empty | Needs LibrarySearchQueryDto Zod schema. |
| `domains/library/library.types.ts` | Empty | Needs TypeScript types. |

#### `domains/materials/`

| File | State | Notes |
|---|---|---|
| `domains/materials/materials.routes.ts` | Empty | Needs full implementation. |
| `domains/materials/materials.service.ts` | Empty | Needs full implementation including compat cache lookup. |
| `domains/materials/materials.repository.ts` | Empty | Needs compat query and cursor pagination. |
| `domains/materials/materials.schema.ts` | Empty | Needs Zod schemas. |
| `domains/materials/materials.types.ts` | Empty | Needs TypeScript types. |

#### `domains/sharing/`

| File | State | Notes |
|---|---|---|
| `domains/sharing/sharing.routes.ts` | Empty | Needs full implementation. |
| `domains/sharing/sharing.services.ts` | Empty | Note: filename is `sharing.services.ts` (plural with 's'), unlike all other domains which use `sharing.service.ts`. Recommend renaming to `sharing.service.ts` for consistency. |
| `domains/sharing/sharing.repository.ts` | Empty | Needs full implementation. |
| `domains/sharing/sharing.schema.ts` | Empty | Needs Zod schemas. |
| `domains/sharing/sharing.types.ts` | Empty | Needs TypeScript types. |

#### `migrations/`

The `migrations/` directory does not exist yet. All 14 SQL migration files and the runner script must be created.

### Summary of State

- **Fully implemented**: `tsconfig.json`, `package.json` (partially — missing deps)
- **Scaffolded (needs rewrite)**: `app.ts`, `properties.dev.env`
- **Stub (comment only — needs implementation)**: `configs/env.ts`, `configs/database.ts`, `configs/storage.ts`, all four middleware files, `domains/auth/*.ts`
- **Empty (0 content — needs full implementation)**: all remaining domain files, all `shared/` files
- **Missing entirely**: `migrations/` directory and all SQL files, `migrations/runner.ts`, `versions.schema.ts`, test files

---

## 3. Phased Delivery Plan

Phases build strictly on each other. Do not start a phase until all its dependencies are green.

---

### Phase 0: Foundations

**Goal**: Establish the reliable core that every subsequent phase depends on. After this phase the server boots, connects to Supabase Postgres, validates env vars at startup, logs requests, and rejects unauthenticated requests with a proper error shape.

**Files to create / modify**:

| Action | Path |
|---|---|
| Modify | `app.ts` — full rewrite: TypeScript imports, middleware stack (helmet, cors, pino-http, json body parser, route mounts, error handler) |
| Implement | `server.ts` — import createApp, call listen, handle SIGTERM/SIGINT gracefully |
| Implement | `configs/env.ts` — Zod schema validating all required env vars; throws on startup if missing |
| Implement | `configs/database.ts` — pg Pool singleton; Supabase client (service role) for auth JWT verify |
| Implement | `configs/storage.ts` — Supabase Storage client initialization |
| Implement | `middleware/auth.ts` — extract Bearer token, verify JWT, attach `req.user = { id, email, plan }` |
| Implement | `middleware/errorHandler.ts` — catch AppError subclasses, map to HTTP status + JSON `{ error: { code, message, details? } }` |
| Implement | `middleware/requestLogger.ts` — pino-http with correlation ID header passthrough |
| Implement | `middleware/validate.ts` — factory: `validate(schema)` returns Express middleware that runs Zod parse and throws ValidationError |
| Implement | `shared/db/client.ts` — export `pool` (pg.Pool using DATABASE_URL from env) |
| Implement | `shared/db/transaction.ts` — `withTransaction<T>(pool, fn)` helper |
| Implement | `shared/db/queryHelper.ts` — `toCamel(row)` snake_case-to-camelCase mapper; `typedQuery<T>(client, sql, params)` wrapper |
| Implement | `shared/errors/AppError.ts` — base class: `message`, `statusCode`, `code` string |
| Implement | `shared/errors/NotFoundError.ts` — 404, code `NOT_FOUND` |
| Implement | `shared/errors/ForbiddenError.ts` — 403, code `FORBIDDEN` |
| Implement | `shared/errors/ValidationError.ts` — 422, code `VALIDATION_ERROR`, carries Zod issue array |
| Implement | `shared/storage/storageClient.ts` — `resolvePublicUrl(path)`, `createSignedUrl(path, expiresIn)` helpers |
| Implement | `shared/types/express.d.ts` — augment `Express.Request` with `user: { id: string; email: string; plan: string }` |
| Add deps | `package.json` — add `zod`, `@supabase/supabase-js`, `pino-http`; add dev deps `@types/pg`, `@types/cookie-parser`, `@types/cors`, `@types/jsonwebtoken`, `@types/bcryptjs`, `vitest` |
| Update | `properties.dev.env` — add `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_STORAGE_CDN_URL`, `NODE_ENV` |

**Endpoints delivered**: None (infrastructure only). A `GET /health` probe returning `{ status: "ok", timestamp }` should be added to `app.ts` directly as the sole non-domain route.

**DB tables / migrations touched**: None (Phase 1 handles migrations).

**Acceptance criteria**:
- `tsx server.ts` starts without error when all env vars are set.
- A missing required env var causes process to exit with a descriptive message before binding the port.
- `GET /health` returns HTTP 200 with `{ status: "ok" }`.
- `GET /` with no Authorization header returns HTTP 401 `{ error: { code: "UNAUTHORIZED", message: "..." } }` (verify auth middleware is wired).
- A deliberate `throw new NotFoundError("x")` in a test route produces HTTP 404 `{ error: { code: "NOT_FOUND", ... } }`.
- pino writes structured JSON to stdout on each request.

**Dependencies**: None (first phase).

---

### Phase 1: Migrations Runner and SQL Files 001–002

**Goal**: Establish the database schema in Supabase Postgres via numbered SQL migration files. Provide a repeatable, idempotent runner. After this phase, `profiles` and the extensions/trigger infrastructure exist in the database.

**Files to create**:

| Action | Path |
|---|---|
| Create dir | `migrations/` |
| Create | `migrations/001_extensions_and_triggers.sql` |
| Create | `migrations/002_profiles.sql` |
| Create | `migrations/run.ts` — migration runner script: reads `migrations/` directory in numeric order, tracks applied migrations in a `schema_migrations` table, runs each unapplied file in a transaction |
| Add script | `package.json` — add `"db:migrate": "tsx migrations/run.ts"` |

**Endpoints delivered**: None.

**DB tables / migrations touched**:
- `001`: extensions (`uuid-ossp`, `pgcrypto`, `citext`, `pg_trgm`, `unaccent`), shared `set_updated_at()` trigger function.
- `002`: `profiles` table, `trg_profiles_updated_at` trigger.

**Acceptance criteria**:
- `npm run db:migrate` runs to completion against a clean Supabase database without error.
- Re-running `npm run db:migrate` is a no-op (idempotent via `schema_migrations` table).
- `profiles` table exists in `public` schema with correct columns and constraints.
- All five extensions are present (`\dx` in psql shows them).

**Dependencies**: Phase 0 (env vars validated, DATABASE_URL available).

---

### Phase 2: Auth Domain

**Goal**: Implement the auth domain. The frontend handles all Supabase Auth flows (register, login, email verify, token refresh). This domain is responsible only for profile synchronization (upsert on first authenticated request), self-read, and profile updates.

**Files to modify / implement**:

| Action | Path |
|---|---|
| Implement | `domains/auth/auth.types.ts` — `UserProfile` type matching `profiles` table |
| Implement | `domains/auth/auth.schema.ts` — `UpdateProfileSchema` (Zod: optional display_name, avatar_url) |
| Implement | `domains/auth/auth.repository.ts` — `upsertProfile(client, userId, email)`, `findProfileById(client, id)`, `updateProfile(client, id, data)` |
| Implement | `domains/auth/auth.service.ts` — `syncProfile(userId, email)` (upsert on login), `getMe(userId)`, `updateMe(userId, data)` |
| Implement | `domains/auth/auth.routes.ts` — mount GET /auth/me, PATCH /auth/me/profile; remove register/login/verify stubs |
| Modify | `app.ts` — mount auth router at `/auth` |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /auth/me | Returns authenticated user's full profile (id, email from JWT + profile columns). Upserts profile row on first call for a new Supabase user. Response: `{ id, email, displayName, avatarUrl, plan, storageUsed, createdAt }` |
| PATCH | /auth/me/profile | Updates `display_name` and/or `avatar_url`. Body validated by UpdateProfileSchema. Response: updated profile object. |

**DB tables / migrations touched**: `profiles` (read/upsert/update).

**Acceptance criteria**:
- `GET /auth/me` with a valid Supabase JWT returns 200 and the profile object.
- `GET /auth/me` with an expired JWT returns 401.
- `GET /auth/me` for a user with no existing profile row creates the row (upsert) and returns it.
- `PATCH /auth/me/profile` with `{ displayName: "Alice" }` updates and returns the row.
- `PATCH /auth/me/profile` with `{ displayName: "" }` (empty string) returns 422 validation error.

**Dependencies**: Phase 0 (auth middleware), Phase 1 (profiles table exists).

---

### Phase 3: Projects Domain

**Goal**: Full project lifecycle: create, read, list (cursor-paginated), update metadata, soft-delete, restore, and atomic duplication.

**Files to implement**:

| Action | Path |
|---|---|
| Implement | `domains/projects/projects.types.ts` |
| Implement | `domains/projects/projects.schema.ts` — `CreateProjectSchema`, `UpdateProjectSchema`, `ListProjectsQuerySchema` (cursor, limit, filter) |
| Implement | `domains/projects/projects.repository.ts` — `findById`, `listByOwner` (cursor pagination), `create`, `updateMeta`, `softDelete`, `restore`, `duplicate` (transaction) |
| Implement | `domains/projects/projects.service.ts` — ownership checks on every mutation; calls repository methods; duplicate calls `withTransaction` |
| Implement | `domains/projects/projects.routes.ts` — mount all endpoints; auth middleware on all; validate request bodies |
| Modify | `app.ts` — mount projects router at `/projects` |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects | List caller's non-deleted projects. Query: `?cursor=<opaque>&limit=<int>&sort=updated_at`. Response: `{ data: Project[], nextCursor: string \| null }` |
| POST | /projects | Create project. Body: `{ name?, floorCount? }`. Response 201: new project row (id, name, floorCount, createdAt, updatedAt). |
| GET | /projects/:id | Get single project metadata (no scene data). 404 if not found or deleted. 403 if not owner (or shared viewer — see Phase 9). |
| PATCH | /projects/:id | Update project metadata (name, thumbnail_url, isTemplate, isPublic). Owner only. |
| DELETE | /projects/:id | Soft-delete (sets `deleted_at`). Owner only. Response 204. |
| POST | /projects/:id/restore | Un-delete a soft-deleted project. Owner only. Response 200. |
| POST | /projects/:id/duplicate | Atomic copy of project row + all project_objects rows. New project name = original + " (Copy)". Response 201: new project id and name. |

**DB tables / migrations touched**: `projects`, `project_objects` (duplicate transaction reads from it; Phase 4 creates it).

Note: Phase 3 can implement everything except the project_objects copy leg of `duplicate`. That leg is completed in Phase 4. The duplicate endpoint should be flagged as incomplete until Phase 4 is done, but the route and service skeleton should exist in Phase 3.

**Acceptance criteria**:
- `POST /projects` creates a row and returns 201.
- `GET /projects` returns cursor-paginated results; second page request with `?cursor=<value>` returns the next page.
- `DELETE /projects/:id` by non-owner returns 403.
- `GET /projects/:id` after soft-delete returns 404.
- `POST /projects/:id/restore` makes the project appear again in list.
- Concurrent duplicate calls do not produce orphaned rows (verified by wrapping in `withTransaction`).

**Dependencies**: Phase 0 (auth, error handling), Phase 2 (profiles exist for FK).

---

### Phase 4: Scenes Domain

**Goal**: Implement the authoritative scene save/load cycle. A single PUT atomically writes `projects.scene_data` and bulk-upserts the `project_objects` registry. GET loads both in one round-trip.

**Files to implement**:

| Action | Path |
|---|---|
| Run migration | `migrations/003_projects.sql` through `migrations/010_project_objects.sql` (see Phase 5 migration list — scenes requires project_objects table) |
| Implement | `domains/scenes/scenes.types.ts` |
| Implement | `domains/scenes/scenes.schema.ts` — `SceneDataSchema` (JSONB passthrough with version field required), `ProjectObjectSchema`, `SaveSceneBodySchema` (sceneData + objects array) |
| Implement | `domains/scenes/scenes.repository.ts` — `loadScene(client, projectId)`, `saveSceneData(client, projectId, sceneData)`, `bulkUpsertObjects(client, projectId, objects)`, `deleteRemovedObjects(client, projectId, incomingIds)` |
| Implement | `domains/scenes/scenes.service.ts` — `loadScene` (joins project + objects, resolves storage URLs), `saveScene` (ownership check, then `withTransaction` wrapping saveSceneData + bulkUpsertObjects + deleteRemovedObjects) |
| Implement | `domains/scenes/scenes.routes.ts` |
| Modify | `domains/projects/projects.service.ts` — complete the `duplicate` transaction leg that copies project_objects |
| Modify | `app.ts` — mount scenes router under `/projects/:id/scene` or nest inside projects router |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/scene | Load full scene: returns `{ sceneData: {...}, objects: ProjectObject[] }`. Objects include resolved `modelUrl` (CDN URL, not storage path). |
| PUT | /projects/:id/scene | Save full scene. Body: `{ sceneData: {...}, objects: ProjectObject[] }`. Atomically writes `projects.scene_data` and bulk-upserts / deletes `project_objects`. Response 200: `{ savedAt: ISO timestamp }`. |

**DB tables / migrations touched**: `projects` (scene_data), `project_objects`.

**Bulk upsert strategy**: Use PostgreSQL `INSERT ... ON CONFLICT (id) DO UPDATE` for the `project_objects` batch. Objects present in DB but absent from the incoming array are deleted (full-replace semantics per save).

**Acceptance criteria**:
- `PUT /projects/:id/scene` then `GET /projects/:id/scene` round-trips the full scene without data loss.
- Saving with 0 objects deletes all existing project_objects rows for that project.
- Saving with 50 objects in a single request completes in under 500ms against a local Supabase instance.
- Concurrent save requests for the same project do not produce duplicate project_objects rows (transaction serialization).
- 403 returned if caller does not own the project (sharing editor write comes in Phase 9).
- `modelUrl` in the GET response is a fully qualified CDN URL, not a raw storage path.

**Dependencies**: Phase 0, Phase 2, Phase 3.

---

### Phase 5: Autosave Domain

**Goal**: Implement the high-frequency autosave cycle that writes to `project_autosaves` (not `projects.scene_data`) and prunes to keep only the last 5 entries per project.

**Files to implement / create**:

| Action | Path |
|---|---|
| Create | `migrations/004_autosaves_versions.sql` — `project_autosaves` and `project_versions` tables (both scaffolded together) |
| Implement | `domains/autosave/autosave.types.ts` |
| Implement | `domains/autosave/autosave.repository.ts` — `insertAutosave(client, projectId, sceneData, clientId)`, `pruneAutosaves(client, projectId, keepLast)`, `getLatestAutosave(client, projectId)` |
| Implement | `domains/autosave/autosave.service.ts` — ownership check; insert; prune (keep-last-5); return saved autosave id and saved_at |
| Implement | `domains/autosave/autosave.routes.ts` |
| Modify | `app.ts` — mount autosave routes nested under `/projects/:id` |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| POST | /projects/:id/autosave | Insert autosave. Body: `{ sceneData: {...}, clientId?: string }`. Prunes to keep last 5 after insert. Response 201: `{ id, savedAt }`. |
| GET | /projects/:id/autosave/latest | Retrieve the most recent autosave for a project. Response: `{ id, sceneData, savedAt, clientId }`. 404 if none exist. |

**DB tables / migrations touched**: `project_autosaves`.

**Acceptance criteria**:
- 6 consecutive POST autosave calls leave exactly 5 rows in `project_autosaves` for that project.
- GET latest returns the most recently inserted row's scene data verbatim.
- 403 returned for non-owner (or non-editor share in Phase 9).
- The prune operation runs in the same transaction as the insert (no orphan rows if insert fails).

**Dependencies**: Phase 0, Phase 2, Phase 3.

---

### Phase 6: Versions Domain

**Goal**: Implement immutable version snapshots: create (snapshot current scene), list, and restore (copy version scene_data back to project).

**Files to implement / create**:

| Action | Path |
|---|---|
| Create | `migrations/004_autosaves_versions.sql` — already planned in Phase 5 (includes `project_versions` table) |
| Create | `domains/versions/versions.schema.ts` — `CreateVersionSchema` (label field) |
| Implement | `domains/versions/version.types.ts` |
| Implement | `domains/versions/versions.repository.ts` — `createVersion(client, projectId, label, userId)` using `next_project_version()` function, `listVersions(client, projectId)`, `getVersion(client, versionId)`, `restoreVersion(client, projectId, versionId)` |
| Implement | `domains/versions/versions.service.ts` — ownership checks; create (snapshot from `projects.scene_data`); restore (`withTransaction`: copy version scene_data to project, re-sync project_objects from service layer) |
| Implement | `domains/versions/version.routes.ts` |
| Modify | `app.ts` — mount versions routes |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/versions | List versions for a project, ordered by version_num DESC. Response: `{ data: Version[] }` (no scene data in list). |
| POST | /projects/:id/versions | Create a named snapshot of the current `projects.scene_data`. Body: `{ label?: string }`. Response 201: `{ id, versionNum, label, createdAt }`. |
| GET | /projects/:id/versions/:vid | Get a single version including full scene_data. |
| POST | /projects/:id/versions/:vid/restore | Restore project to this version. Copies `project_versions.scene_data` to `projects.scene_data` and re-syncs `project_objects`. Response 200: `{ restoredAt }`. |

**DB tables / migrations touched**: `project_versions`, `projects` (restore updates scene_data), `project_objects` (restore re-syncs via scene service).

**Acceptance criteria**:
- POST /versions creates a row with auto-incremented `version_num` starting at 1.
- A second POST /versions produces version_num = 2.
- GET /versions lists newest first.
- POST /versions/:vid/restore followed by GET /projects/:id/scene returns the scene from that version.
- Restore is atomic (transaction): if project_objects sync fails, `projects.scene_data` is not updated.

**Dependencies**: Phase 0, Phase 2, Phase 3, Phase 4 (scenes service reused for restore re-sync), Phase 5 (shares migration 004).

---

### Phase 7: Library and Categories Domain

**Goal**: Implement the object library catalog: category tree, object browse (cursor-paginated, filtered), full-text + trigram search, and single-object detail with resolved CDN URLs.

**Files to implement / create**:

| Action | Path |
|---|---|
| Create | `migrations/005_object_categories.sql` |
| Create | `migrations/006_library_objects.sql` — includes `placement_surface` enum, table, FTS trigger, tsvector update function |
| Implement | `domains/library/library.types.ts` |
| Implement | `domains/library/library.schema.ts` — `LibrarySearchQuerySchema` (q, categoryId, placement, tags, isPremium, cursor, limit) |
| Implement | `domains/library/library.repository.ts` — `listObjects` (cursor pagination, all filter combinations), `searchObjects` (FTS + trgm), `getObjectById`, `listCategories` (full tree) |
| Implement | `domains/library/library.service.ts` — resolves CDN URLs on all returned objects; routes to search vs. browse based on presence of `q` param; premium gating check against `req.user.plan` |
| Implement | `domains/library/library.routes.ts` |
| Modify | `app.ts` — mount library router at `/library` |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /library/categories | Full category tree (id, parentId, slug, name, iconUrl, sortOrder). Cached in-memory (TTL 5 min). |
| GET | /library/objects | Paginated object list. Query params: `categoryId`, `placement`, `tags` (comma-separated), `isPremium`, `cursor`, `limit` (default 50, max 100). Response: `{ data: LibraryObject[], nextCursor }`. |
| GET | /library/objects/search | FTS + trigram search. Query params: `q` (required), `categoryId`, `placement`, `limit`. Response: `{ data: LibraryObject[] }` (no cursor; search results capped at 20). |
| GET | /library/objects/:id | Single object detail with all fields + resolved modelUrl and lodUrls. |

**DB tables / migrations touched**: `object_categories`, `library_objects`.

**Caching**: Category tree and the compatibility matrix are loaded into an in-memory Map on startup (see Section 4 — Caching).

**Acceptance criteria**:
- `GET /library/objects?categoryId=<uuid>` returns only objects in that category.
- `GET /library/objects/search?q=armchair` returns relevant results (verified against seeded data).
- Trigram search: `GET /library/objects/search?q=armchiar` (typo) still returns "armchair".
- Cursor pagination: requesting page 2 with `?cursor=<value>` does not repeat page 1 results.
- `is_premium = true` objects are hidden when `req.user.plan === 'free'` (if premium gating is enabled — see Open Questions).
- CDN base URL is prepended to `modelUrl` in the response.
- Category tree endpoint responds in under 10ms on second call (served from in-memory cache).

**Dependencies**: Phase 0, Phase 1 (extensions for trgm/citext).

---

### Phase 8: Materials and Compatibility Domain

**Goal**: Implement the material catalog and the compatibility query so the UI material picker only shows materials valid for a selected object. Load the full compatibility matrix into memory at startup for sub-millisecond lookups.

**Files to implement / create**:

| Action | Path |
|---|---|
| Create | `migrations/007_material_categories.sql` |
| Create | `migrations/008_materials.sql` — includes `GENERATED ALWAYS AS` tsvector column, FTS index, trgm index |
| Create | `migrations/009_compat_tables.sql` — `category_material_compat`, `object_material_compat_override`; also includes `compatible_material_categories($1)` SQL function |
| Implement | `domains/materials/materials.types.ts` |
| Implement | `domains/materials/materials.schema.ts` — `MaterialSearchQuerySchema`, `CompatibleMaterialsQuerySchema` |
| Implement | `domains/materials/materials.repository.ts` — `listMaterials` (cursor pagination, category filter), `getMaterialById`, `getCompatibleMaterialCategories` (SQL function call), `loadCompatibilityMatrix` (full load for in-memory cache) |
| Implement | `domains/materials/materials.service.ts` — compat cache lookup (populated at startup, refreshed on TTL or explicit invalidation), resolves CDN URLs |
| Implement | `domains/materials/materials.routes.ts` |
| Modify | `app.ts` — mount materials router at `/materials`; call cache warm-up on startup |
| Modify | `configs/database.ts` — export a `warmupCompatibilityCache()` function called from `server.ts` after pool is ready |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /materials | List materials. Query: `categoryId`, `cursor`, `limit`. Response: `{ data: Material[], nextCursor }`. |
| GET | /materials/search | FTS + trgm search. Query: `q`, `categoryId`, `limit`. Response: `{ data: Material[] }`. |
| GET | /materials/:id | Single material detail with resolved texture URLs. |
| GET | /materials/compatible/:objectId | Returns all materials valid for a given library object, ordered by category. Uses in-memory compatibility matrix with DB fallback. Response: `{ data: Material[], categories: MaterialCategory[] }`. |

**DB tables / migrations touched**: `material_categories`, `materials`, `category_material_compat`, `object_material_compat_override`.

**Acceptance criteria**:
- `GET /materials/compatible/:objectId` returns only materials whose category is in the compatibility matrix for the object's category, with per-object overrides applied correctly.
- An override with `allow = false` removes a material category that the category-level matrix would otherwise include.
- An override with `allow = true` adds a material category not in the category matrix.
- Response time for `/compatible/:objectId` is under 5ms (served from in-memory cache).
- Cache is reloaded when `/materials/compatible/:objectId` is called and the cache is stale (TTL-based or on-demand).

**Dependencies**: Phase 0, Phase 1, Phase 7 (object_categories and library_objects tables required for compat FK).

---

### Phase 9: Sharing Domain

**Goal**: Implement project sharing: named-user shares, link shares (token-based), expiry, permission levels, and revocation. Update auth middleware to recognize share tokens.

**Files to implement / create**:

| Action | Path |
|---|---|
| Create | `migrations/011_sharing.sql` — `share_permission` enum, `project_shares` table, indexes |
| Implement | `domains/sharing/sharing.types.ts` |
| Implement | `domains/sharing/sharing.schema.ts` — `CreateNamedShareSchema`, `CreateLinkShareSchema`, `UpdateShareSchema` |
| Rename | `domains/sharing/sharing.services.ts` → `domains/sharing/sharing.service.ts` (fix naming inconsistency) |
| Implement | `domains/sharing/sharing.service.ts` — create named share, create link share (generate 32-hex token), update permission, revoke, list shares for project, resolve share token |
| Implement | `domains/sharing/sharing.repository.ts` — CRUD on `project_shares`, `findByToken`, `listForProject` |
| Implement | `domains/sharing/sharing.routes.ts` |
| Modify | `middleware/auth.ts` — optionally accept `?shareToken=<token>` query param for link share access on read endpoints; validate token against DB, attach `req.shareContext = { projectId, permission }` |
| Modify | `domains/projects/projects.service.ts` — respect `req.shareContext` on GET /projects/:id |
| Modify | `domains/scenes/scenes.service.ts` — allow editor shares to PUT /projects/:id/scene |
| Modify | `app.ts` — mount sharing routes under `/projects/:id/share` |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /projects/:id/share | List all share records for a project (owner only). Response: `{ data: Share[] }`. |
| POST | /projects/:id/share | Create a named-user or link share. Body: `{ sharedWith?: uuid, permission: "viewer"\|"commenter"\|"editor", expiresAt?: ISO }`. If `sharedWith` is absent, generates a link share token. Response 201: `{ id, token?, permission, expiresAt }`. |
| PATCH | /projects/:id/share/:shareId | Update permission or expiry. Owner only. |
| DELETE | /projects/:id/share/:shareId | Revoke a share (hard-delete the row). Owner only. Response 204. |
| GET | /share/:token | Resolve a share token: returns public project metadata and the share's permission level. Used by the frontend to render a shared view without requiring login for viewer shares. |

**DB tables / migrations touched**: `project_shares`.

**Acceptance criteria**:
- POST share with `sharedWith = null` returns a `token` field.
- GET /projects/:id/scene with `?shareToken=<valid_viewer_token>` returns 200.
- GET /projects/:id/scene with `?shareToken=<expired_token>` returns 403.
- PUT /projects/:id/scene with a viewer share token returns 403.
- PUT /projects/:id/scene with an editor share token returns 200.
- DELETE share removes the row; subsequent requests with that token return 403.

**Dependencies**: Phase 0, Phase 2, Phase 3, Phase 4.

---

### Phase 10: Hardening

**Goal**: Apply RLS policies, full request validation coverage, rate limiting per-endpoint, OpenAPI documentation, and integration test suite. This phase does not add new features; it makes everything production-grade.

**Files to create / modify**:

| Action | Path |
|---|---|
| Create | `migrations/010_project_objects.sql` — if not already applied in Phase 4 |
| Create | `migrations/012_operations_log.sql` — `project_operations` table + initial partition |
| Create | `migrations/013_indexes.sql` — all indexes from spec Section 5 |
| Create | `migrations/014_rls_policies.sql` — all RLS ENABLE + policy statements from spec Section 10 |
| Modify | `middleware/auth.ts` — add per-route rate limit contexts |
| Create | `middleware/rateLimiter.ts` — configure `express-rate-limit` instances: `standardLimiter` (100 req/min), `autosaveLimiter` (120 req/min for POST /autosave), `searchLimiter` (30 req/min for search endpoints) |
| Create | `shared/openapi/openapi.ts` — hand-authored or auto-generated OpenAPI 3.1 spec; served at `GET /docs/openapi.json` |
| Create | `tests/` directory with integration tests (see Section 7) |
| Modify | `package.json` — add `"test": "vitest run"` and `"test:watch": "vitest"` scripts |

**Endpoints delivered**:

| Method | Path | Contract |
|---|---|---|
| GET | /docs/openapi.json | Serve the OpenAPI 3.1 specification document. No auth required. |

**DB tables / migrations touched**: `project_operations` (scaffold), all tables (RLS enable + policies), all indexes applied.

**Acceptance criteria**:
- `GET /library/objects` with 200 rapid requests in 60 seconds from the same IP is rate-limited after the threshold.
- POST /projects/:id/autosave at 3 requests/second does not produce duplicate rows (idempotency via transaction).
- All endpoints listed in the API Surface table (Section 6) return proper 422 responses on invalid request bodies.
- `npm run test` passes with coverage above 80% across service and repository files.
- RLS migration applies cleanly; a direct psql query as a different `auth.uid()` does not return rows it should not see.
- `GET /docs/openapi.json` returns a valid OpenAPI 3.1 document.

**Dependencies**: All prior phases.

---

## 4. Cross-Cutting Concerns

### Authentication Flow

1. The frontend authenticates with Supabase Auth and receives an access token (JWT).
2. Every API request includes `Authorization: Bearer <token>` in the header.
3. `middleware/auth.ts` extracts the token and verifies its signature. Two options exist (see Open Questions):
   - Option A (recommended): verify against Supabase JWKS endpoint (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) using `jsonwebtoken` + JWKS fetching with caching. This does not require storing the JWT secret in env.
   - Option B (simpler): symmetric HS256 verify using `SUPABASE_JWT_SECRET` from env. Requires the secret to be present in the deployment environment.
4. On success, the decoded payload is attached as `req.user = { id: sub, email, plan }`. The `plan` field requires the profile to be read from the DB; alternatively, a custom Supabase JWT claim can carry it (see Open Questions).
5. On failure, `next(new UnauthorizedError("Invalid or expired token"))` propagates to the error handler.

For link-share endpoints, `middleware/auth.ts` additionally checks for a `?shareToken` query parameter and attaches `req.shareContext` when a valid, non-expired share token is found. Authenticated endpoints that also accept share tokens must handle both `req.user` (if present) and `req.shareContext`.

### Error Taxonomy

All errors extend `AppError(message, statusCode, code)`. The error handler in `middleware/errorHandler.ts` catches them and produces:

```
HTTP <statusCode>
{
  "error": {
    "code": "<string>",
    "message": "<human-readable>",
    "details": [...]   // optional, Zod issues for ValidationError
  }
}
```

| Class | HTTP | Code |
|---|---|---|
| `AppError` | 500 | `INTERNAL_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` (add this class in Phase 0) |
| `ValidationError` | 422 | `VALIDATION_ERROR` |
| `ConflictError` | 409 | `CONFLICT` (add if needed for duplicate slug, etc.) |

Unhandled errors (non-AppError subclasses) are caught by the error handler, logged at `error` level with full stack trace, and returned as HTTP 500 `INTERNAL_ERROR` without exposing stack traces to the client.

### Validation Pattern

The `validate` middleware factory in `middleware/validate.ts` accepts a Zod schema and a target (`body`, `query`, or `params`). It parses the target, replaces it with the parsed/coerced value (so downstream handlers receive typed data), and calls `next(new ValidationError(...))` on parse failure.

Usage in routes:

```
router.post('/', auth, validate(CreateProjectSchema, 'body'), handler)
```

All request bodies, all paginated query strings, and all UUID path params must be validated via Zod before reaching the service layer.

### DB Query Helpers

`shared/db/queryHelper.ts` provides:

- `toCamel(row: Record<string, unknown>)`: converts all snake_case keys in a query result row to camelCase. Applied to every repository result before returning to the service layer.
- `typedQuery<T>(client: PoolClient | Pool, sql: string, params: unknown[]): Promise<T[]>`: wraps `client.query(sql, params)` and applies `toCamel` to every row. Returns a typed array or empty array. Throws an `AppError` for unexpected DB errors.

All repositories use `typedQuery`. No raw `client.query` calls outside of repository files.

### Transaction Usage

`withTransaction` from `shared/db/transaction.ts` is used for all multi-table atomic operations:

- Scene save (projects.scene_data + project_objects bulk upsert + delete removed)
- Project duplication (project row copy + project_objects copy)
- Version restore (projects.scene_data update + project_objects re-sync)
- Autosave insert + prune

Single-table reads and single-row mutations do not require transactions; they use the pool directly.

### Storage URL Resolution

The database stores bare Supabase Storage paths (e.g., `objects/furniture/chairs/eames.glb`). The service layer resolves these to usable URLs before returning data to the client:

- **Public assets** (library objects, materials): constructed as `${SUPABASE_STORAGE_CDN_URL}/storage/v1/object/public/assets/<path>`. No auth required by the CDN.
- **Premium / private assets**: a signed URL is generated via `createSignedUrl(path, expirySeconds)` in `shared/storage/storageClient.ts`. Signed URLs are generated per-request; they should not be cached server-side unless a shared short-lived token strategy is designed.

The CDN base URL and the signed URL function are the only two URL forms used in responses. Storage paths are never returned directly to the client.

### Caching Plan

| Data | Strategy | Invalidation |
|---|---|---|
| Object category tree | In-process `Map<string, CategoryTree>` loaded at startup; TTL 5 minutes (check TTL on each request, reload async if stale) | On TTL expiry. No event-driven invalidation in v1. |
| Material category list | Same in-process map | Same |
| Compatibility matrix (`object_category_id → Set<material_category_id>` and per-object overrides) | In-process `Map` loaded at startup via `warmupCompatibilityCache()` in `server.ts`; TTL 5 minutes | On TTL expiry. Provide an admin-only `POST /admin/cache/invalidate` endpoint in Phase 10 if catalog updates are frequent. |
| Library object pages | No server-side cache in v1; client-side pagination state handles this | — |
| Project data | No server-side cache; data is personalized and changes frequently | — |

Redis is explicitly not included in v1. The in-process cache is sufficient for a single API instance and avoids operational overhead. If horizontal scaling is needed, extract the cache to Redis at that point.

---

## 5. Migration Plan

All migrations are plain SQL files in `migrations/`. The runner (`migrations/run.ts`) tracks applied migrations in a `public.schema_migrations` table. Each migration runs in a transaction; a failure rolls back and halts the runner with the failing file name.

Never modify an already-applied migration file. Corrections go in a new numbered migration.

| File | Contents | Key DDL |
|---|---|---|
| `001_extensions_and_triggers.sql` | Bootstrap extensions and shared trigger | `CREATE EXTENSION IF NOT EXISTS` for uuid-ossp, pgcrypto, citext, pg_trgm, unaccent; `CREATE OR REPLACE FUNCTION set_updated_at()` |
| `002_profiles.sql` | User profile extension table | `CREATE TABLE public.profiles`, FK to `auth.users`, `trg_profiles_updated_at` trigger |
| `003_projects.sql` | Project table | `CREATE TABLE public.projects` with `scene_data JSONB`, `deleted_at`, `is_template`, `is_public`; `trg_projects_updated_at` trigger |
| `004_autosaves_versions.sql` | Autosave buffer and version history | `CREATE TABLE public.project_autosaves`, `CREATE TABLE public.project_versions`, `CREATE OR REPLACE FUNCTION next_project_version()` |
| `005_object_categories.sql` | Object category tree | `CREATE TABLE public.object_categories` (self-referencing `parent_id`) |
| `006_library_objects.sql` | Object library catalog | `CREATE TYPE placement_surface AS ENUM`, `CREATE TABLE public.library_objects` with `search_vector TSVECTOR`, `update_library_objects_search_vector()` FTS trigger function and trigger, `trg_library_objects_updated_at` trigger |
| `007_material_categories.sql` | Material category list | `CREATE TABLE public.material_categories` |
| `008_materials.sql` | Material catalog | `CREATE TABLE public.materials` with `search_vector TSVECTOR GENERATED ALWAYS AS (...) STORED`, `trg_materials_updated_at` trigger |
| `009_compat_tables.sql` | Compatibility rules and SQL function | `CREATE TABLE public.category_material_compat`, `CREATE TABLE public.object_material_compat_override`, `CREATE OR REPLACE FUNCTION compatible_material_categories(p_object_id UUID)` (the CTE query from spec Section 6 wrapped in a SQL function) |
| `010_project_objects.sql` | Placed object instances | `CREATE TABLE public.project_objects` with JSONB columns for transform, material_slots, instance_props; `trg_project_objects_updated_at` trigger |
| `011_sharing.sql` | Project sharing | `CREATE TYPE share_permission AS ENUM ('viewer','commenter','editor')`, `CREATE TABLE public.project_shares` |
| `012_operations_log.sql` | Operation log (future CRDT scaffold) | `CREATE TABLE public.project_operations PARTITION BY RANGE (applied_at)`, initial partition `project_operations_2025_2026` for values `('2025-01-01')` to `('2027-01-01')` |
| `013_indexes.sql` | All performance indexes | All `CREATE INDEX` statements from spec Section 5 — covering projects, library_objects, materials, project_objects, project_versions, project_autosaves, project_shares, project_operations, category_material_compat, object_categories |
| `014_rls_policies.sql` | RLS enable + policies | All `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements from spec Section 10 |

### Runner Approach

`migrations/run.ts` is a plain TypeScript script executed with `tsx`:

1. Connect to PostgreSQL using `DATABASE_URL` from env.
2. Create `public.schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` if it does not exist.
3. Read all `*.sql` files from the `migrations/` directory sorted lexicographically (numeric prefix ensures correct order).
4. For each file, check if `filename` exists in `schema_migrations`. Skip if present.
5. Run the file content as a single `client.query(sql)` call inside `BEGIN / COMMIT`. On error, `ROLLBACK` and exit with a non-zero code and the file name.
6. On success, insert the filename into `schema_migrations`.

This approach requires no ORM, no migration library, and produces human-readable diffs in version control.

---

## 6. API Surface Table

All endpoints require `Authorization: Bearer <supabase_jwt>` unless noted. "Owner" means `projects.owner_id = req.user.id`. "Share" means a valid non-expired `project_shares` row for `req.user.id` or a valid share token.

| # | Method | Path | Auth | Request Schema | Response Schema | RLS Expectation |
|---|---|---|---|---|---|---|
| 1 | GET | /health | None | — | `{ status, timestamp }` | No RLS (no DB query) |
| 2 | GET | /docs/openapi.json | None | — | OpenAPI 3.1 document | No RLS |
| 3 | GET | /auth/me | JWT | — | `UserProfile` | profiles: SELECT own row |
| 4 | PATCH | /auth/me/profile | JWT | `{ displayName?, avatarUrl? }` | `UserProfile` | profiles: UPDATE own row |
| 5 | GET | /projects | JWT | `?cursor&limit&sort` | `{ data: Project[], nextCursor }` | projects: SELECT where owner_id = auth.uid() |
| 6 | POST | /projects | JWT | `{ name?, floorCount? }` | `Project` (201) | projects: INSERT with owner_id |
| 7 | GET | /projects/:id | JWT or ShareToken | — | `ProjectMeta` | projects: SELECT (owner or share) |
| 8 | PATCH | /projects/:id | JWT (owner) | `{ name?, thumbnailUrl?, isTemplate?, isPublic? }` | `ProjectMeta` | projects: UPDATE (owner) |
| 9 | DELETE | /projects/:id | JWT (owner) | — | 204 | projects: UPDATE deleted_at (owner) |
| 10 | POST | /projects/:id/restore | JWT (owner) | — | `ProjectMeta` | projects: UPDATE deleted_at (owner) |
| 11 | POST | /projects/:id/duplicate | JWT (owner) | — | `{ id, name }` (201) | projects + project_objects: INSERT |
| 12 | GET | /projects/:id/scene | JWT or ShareToken | — | `{ sceneData, objects: ProjectObject[] }` | project_objects: SELECT via project |
| 13 | PUT | /projects/:id/scene | JWT (owner or editor share) | `{ sceneData, objects: ProjectObject[] }` | `{ savedAt }` | projects + project_objects: UPDATE/INSERT |
| 14 | POST | /projects/:id/autosave | JWT (owner or editor share) | `{ sceneData, clientId? }` | `{ id, savedAt }` (201) | project_autosaves: INSERT |
| 15 | GET | /projects/:id/autosave/latest | JWT (owner or editor share) | — | `{ id, sceneData, savedAt, clientId }` | project_autosaves: SELECT |
| 16 | GET | /projects/:id/versions | JWT (owner or share) | — | `{ data: VersionSummary[] }` | project_versions: SELECT |
| 17 | POST | /projects/:id/versions | JWT (owner) | `{ label? }` | `VersionSummary` (201) | project_versions: INSERT |
| 18 | GET | /projects/:id/versions/:vid | JWT (owner or share) | — | `VersionDetail` (with sceneData) | project_versions: SELECT |
| 19 | POST | /projects/:id/versions/:vid/restore | JWT (owner) | — | `{ restoredAt }` | projects + project_objects: UPDATE |
| 20 | GET | /library/categories | JWT | — | `{ data: CategoryTree[] }` | object_categories: SELECT (all authenticated) |
| 21 | GET | /library/objects | JWT | `?categoryId&placement&tags&isPremium&cursor&limit` | `{ data: LibraryObject[], nextCursor }` | library_objects: SELECT active only |
| 22 | GET | /library/objects/search | JWT | `?q&categoryId&placement&limit` | `{ data: LibraryObject[] }` | library_objects: SELECT active only |
| 23 | GET | /library/objects/:id | JWT | — | `LibraryObjectDetail` | library_objects: SELECT active only |
| 24 | GET | /materials | JWT | `?categoryId&cursor&limit` | `{ data: Material[], nextCursor }` | materials: SELECT active only |
| 25 | GET | /materials/search | JWT | `?q&categoryId&limit` | `{ data: Material[] }` | materials: SELECT active only |
| 26 | GET | /materials/:id | JWT | — | `MaterialDetail` | materials: SELECT active only |
| 27 | GET | /materials/compatible/:objectId | JWT | — | `{ data: Material[], categories: MaterialCategory[] }` | materials + compat tables: SELECT |
| 28 | GET | /projects/:id/share | JWT (owner) | — | `{ data: Share[] }` | project_shares: SELECT |
| 29 | POST | /projects/:id/share | JWT (owner) | `{ sharedWith?, permission, expiresAt? }` | `Share` (201) | project_shares: INSERT |
| 30 | PATCH | /projects/:id/share/:shareId | JWT (owner) | `{ permission?, expiresAt? }` | `Share` | project_shares: UPDATE |
| 31 | DELETE | /projects/:id/share/:shareId | JWT (owner) | — | 204 | project_shares: DELETE |
| 32 | GET | /share/:token | None or JWT | — | `{ projectMeta, permission }` | project_shares: SELECT by token |

---

## 7. Testing Strategy

### Test Types per Phase

| Phase | Unit Tests | Integration Tests | Notes |
|---|---|---|---|
| 0 | Error classes, `toCamel`, `withTransaction` logic | Health endpoint, auth middleware with mock JWT | Mock pool client for withTransaction unit test |
| 1 | Migration runner file-sort logic | Run migrations against a test DB | Use a dedicated test DB (e.g., Supabase local dev via `supabase start`) |
| 2 | auth.service (upsert/sync logic) | GET /auth/me end-to-end | Test with a real JWT from Supabase test project |
| 3 | projects.service ownership logic, cursor construction | All projects CRUD endpoints | Include duplicate transaction test |
| 4 | scenes.service bulk upsert logic | Scene save/load round-trip (most critical test) | Verify no data loss across full scene cycle |
| 5 | autosave.service prune-keep-5 | POST /autosave × 6 → assert 5 rows remain | Transaction atomicity test |
| 6 | versions.service version_num increment | Version create + restore cycle | Restore atomicity test |
| 7 | library.service premium gating, URL resolution | Library browse, FTS search, trigram search | Requires seeded catalog data |
| 8 | materials.service compat override logic | Compatible materials for an object with override | Cache warm-up + cache stale-reload test |
| 9 | sharing.service token generation, expiry check | Share create + access via token | Expired token → 403 test |
| 10 | — | Full integration test suite + rate limiter test | Coverage report target: 80%+ |

### Test Infrastructure

- **Test runner**: Vitest (fast, native TypeScript support, compatible with CommonJS via `tsx` transform).
- **Test database**: Supabase local development instance (`supabase start`). Each test suite runs migrations to a clean schema at the start of the test run. Do not use the production or staging database for tests.
- **Fixtures**: A `tests/fixtures/` directory contains seed SQL scripts for: one test user profile, three projects, a small catalog of 10 library objects across two categories, 5 materials, and a compatible category matrix.
- **HTTP testing**: Use `supertest` against the Express app instance (no live server port needed). Import `createApp()` from `app.ts` and pass it to `supertest(app)`.
- **JWT mocking**: In tests, generate a valid test JWT signed with the same `SUPABASE_JWT_SECRET` from the test environment. Do not use real user credentials in CI.

### Critical Test Cases (must not be skipped)

1. **Scene save/load round-trip**: PUT /projects/:id/scene with 25 objects, then GET /projects/:id/scene — assert all 25 objects are returned with identical transforms and material_slots.
2. **Duplication transaction**: POST /projects/:id/duplicate — assert new project has all same project_objects; assert original project is unchanged; assert failure mid-transaction leaves no orphan rows.
3. **Autosave prune**: 6 consecutive POST /autosave calls — assert exactly 5 rows in project_autosaves for that project.
4. **Version restore atomicity**: POST /versions/:vid/restore — kill the process mid-transaction (simulate with a deliberate error) — assert project.scene_data and project_objects are unchanged.
5. **Share token expiry**: Create a share with `expiresAt = now - 1 minute` — assert GET /projects/:id/scene with that token returns 403.

---

## 8. Risks and Open Questions

The following items are ambiguous in the current spec and must be decided before or during implementation. They are listed in recommended resolution order.

### RQ-1: JWT Verification Approach (RESOLVE BEFORE PHASE 0)

**Question**: Should the API verify Supabase JWTs via:
- (A) Symmetric HS256 using `SUPABASE_JWT_SECRET` from env, or
- (B) Asymmetric RS256 via Supabase JWKS endpoint (`SUPABASE_URL/auth/v1/.well-known/jwks.json`) with key caching?

**Impact**: Option A is simpler to implement (one env var, `jsonwebtoken.verify(token, secret)`). Option B is more secure (secret never stored in env) but requires JWKS fetching with caching and handling key rotation. Supabase default is HS256; RS256 requires Supabase Pro plan with custom JWT settings.

**Recommendation**: Use Option A (HS256) for v1. Document the upgrade path to Option B when the project scales beyond a single team.

### RQ-2: User `plan` in JWT vs DB (RESOLVE BEFORE PHASE 0)

**Question**: Should `req.user.plan` (used for premium gating in Phase 7) come from:
- (A) A custom Supabase JWT claim (`app_metadata.plan`) set when the user's plan changes, or
- (B) A DB lookup to `profiles.plan` on every authenticated request?

**Impact**: Option A avoids a DB query per request but requires Supabase Auth hook configuration to keep the claim in sync when the plan changes. Option B is always fresh but adds 1 DB round-trip per request (mitigated by caching the profile in `req`).

**Recommendation**: For v1, use Option B with a simple in-request profile cache (`req.user` populated by a single SELECT in auth middleware). Plan changes are infrequent and do not warrant JWT hook complexity at this stage.

### RQ-3: Premium Gating Behavior (RESOLVE BEFORE PHASE 7)

**Question**: When a user on the `free` plan requests `GET /library/objects` or `GET /materials/compatible/:objectId`, should premium items be:
- (A) Excluded entirely from results, or
- (B) Included but flagged with `isPremium: true` so the UI can show a "lock" icon?

**Impact**: Option B is better UX (shows users what they're missing). Option A simplifies queries. The spec says `is_premium` exists but does not specify enforcement behavior.

**Recommendation**: Return all objects (Option B) with the `isPremium` flag. Let the frontend render the lock. If the user tries to place a premium object and the API needs server-side enforcement, add a check in the scenes PUT handler.

### RQ-4: Autosave Prune Strategy — Keep-Last-5 vs. Hourly Limit (RESOLVE BEFORE PHASE 5)

**Question**: The spec says "keep last 5 autosaves per project". The `autosave.service.ts` stub comment says "hourly limit". Are these two different constraints (hourly rate limit on the endpoint AND keep-last-5 prune), or should only one apply?

**Impact**: If both apply, the implementation needs both a rate limiter on the endpoint and a prune-on-insert. If only keep-last-5 applies, the hourly limit note is noise. Decide before implementing Phase 5.

**Recommendation**: Implement keep-last-5 pruning (per spec). Apply the standard `autosaveLimiter` rate limiter (e.g., 120 req/hour = 2/min) to the endpoint as an abuse prevention measure separate from the prune logic.

### RQ-5: Scene Data Server-Side Validation (RESOLVE BEFORE PHASE 4)

**Question**: Should the API validate the shape of `scene_data` JSONB before writing it?

**Options**:
- (A) Trust the client; only verify the top-level `{ version: number }` field is present.
- (B) Full Zod schema validation of `scene_data` including floors, nodes, walls arrays.

**Impact**: Option B prevents corrupt scene data from being written but couples the API schema to the frontend editor's evolving scene format — every scene schema change requires an API deploy. Option A is more flexible but allows malformed data into the DB.

**Recommendation**: Option A for v1. Validate only that `scene_data` is a JSON object with a numeric `version` field. Log warnings if unknown top-level keys are present. Revisit if data corruption issues arise.

### RQ-6: Signed URL Strategy for Premium Assets (RESOLVE BEFORE PHASE 7)

**Question**: Should premium library object model URLs be returned as signed URLs (time-limited, require auth) or as public CDN URLs?

**Impact**: Signed URLs prevent premium content from being accessed without a valid session, but they expire and cannot be cached by the client browser. Public URLs are cacheable but expose premium model files to anyone who knows the URL.

**Recommendation**: Use signed URLs for premium model files (`is_premium = true` objects). Use public CDN URLs for non-premium objects and all material textures. The signed URL expiry should be long enough to complete a session (e.g., 4 hours) and regenerated on scene load.

### RQ-7: `app.ts` Rewrite Compatibility

**Question**: The existing `app.ts` uses `require()` CommonJS style and references `./middleware/CorsMiddleware` and `./routes` which do not exist in the new structure. These must be replaced. Confirm there is no frontend or other service currently calling a route registered in the old `./routes` module.

**Recommendation**: Confirm with the team that no existing client depends on any routes in the current `app.ts` before rewriting. If the project is greenfield (no deployed version yet), proceed with the full rewrite immediately.

### RQ-8: `sharing.services.ts` Naming Inconsistency

The file `domains/sharing/sharing.services.ts` uses the plural `services` suffix, unlike all other domains (`*.service.ts`). This should be renamed to `sharing.service.ts` before any code is written in it. Confirm this rename will not break any existing import.

### RQ-9: `versions` Domain — Missing `versions.schema.ts`

The `domains/versions/` folder has no `versions.schema.ts` file (unlike all other domains). A `CreateVersionSchema` (label field) must be created in this file during Phase 6. No existing file needs to be renamed; the file simply needs to be created.

### RQ-10: Migration Partition Date Range

Migration `012_operations_log.sql` creates a partition `project_operations_2025_2026` for range `('2025-01-01')` to `('2027-01-01')`. Since the current date is 2026-05-20, this partition is already active. A new partition `project_operations_2027_2028` should be created before January 2027. Add a calendar reminder or a startup check in `server.ts` that warns when the current date is within 60 days of the current partition's upper bound.

---

## 9. Estimated Effort

Sizing: S = half day or less; M = 1–2 days; L = 3–4 days.

| Phase | Description | Effort |
|---|---|---|
| 0 | Foundations (env, db, middleware, shared/) | L |
| 1 | Migrations runner + SQL 001–002 | M |
| 2 | Auth domain (profile sync, GET/PATCH /auth/me) | S |
| 3 | Projects domain (CRUD, pagination, duplicate) | L |
| 4 | Scenes domain (load/save, bulk upsert, transaction) | L |
| 5 | Autosave domain (insert + prune) | S |
| 6 | Versions domain (snapshot, list, restore) | M |
| 7 | Library domain (FTS, trgm, cursor pagination) | L |
| 8 | Materials domain (catalog, compat cache, picker) | M |
| 9 | Sharing domain (named + link, token, expiry) | M |
| 10 | Hardening (RLS, rate limits, OpenAPI, tests) | L |

**Total estimated effort**: approximately 6–8 developer-weeks for a single developer working full-time, including testing. Phases 0, 3, 4, 7, and 10 are the largest investments.

The critical path is: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4. Everything after Phase 4 can be developed in any order relative to each other, as they share only the auth middleware and pool as hard dependencies.

---

*Plan authored against `DATABASE_ARCHITECTURE.md` spec as of 2026-05-20. Resolve all open questions marked "RESOLVE BEFORE PHASE N" before starting that phase.*
