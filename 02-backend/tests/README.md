# Integration Tests

## Stack

- **Runner**: Vitest (`npm test`)
- **HTTP client**: supertest (no live server port needed)
- **Test DB**: local Supabase instance (`supabase start`)

## Running Tests

```bash
npm test              # single run
npm run test:watch    # watch mode
```

## Pattern

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

it('example', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
});
```

## JWT Mocking

Generate a test JWT signed with `SUPABASE_JWT_SECRET` from the test environment:

```ts
import jwt from 'jsonwebtoken';

function makeTestToken(userId: string, plan = 'free') {
  return jwt.sign(
    { sub: userId, email: 'test@example.com', app_metadata: { plan } },
    process.env.SUPABASE_JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}
```

Then pass it as a header:

```ts
const token = makeTestToken('test-user-uuid');
const res = await request(app)
  .get('/auth/me')
  .set('Authorization', `Bearer ${token}`);
```

## Test Database

Each test suite should run migrations against a clean local Supabase instance.
Use a `beforeAll` hook to connect and verify the DB is available before running
DB-touching tests. Skip DB tests if `DATABASE_URL` points to production.

## Extending

Add new test files under `tests/` following the naming convention `<domain>.test.ts`.
For domain-specific tests, seed test data in `beforeAll` and clean up in `afterAll`.
