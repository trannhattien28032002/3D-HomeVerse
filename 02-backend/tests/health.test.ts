import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';

/**
 * Health endpoint integration test.
 *
 * This is the canonical example of how to write integration tests for this API.
 * Pattern:
 *   1. Import createApp() — no live server port needed.
 *   2. Pass the Express app to supertest.
 *   3. Each test suite that needs a DB should use a test Supabase instance
 *      (run `supabase start` locally) and set DATABASE_URL in the test env.
 *
 * See tests/README.md for extending this pattern to other domains.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('GET /docs/openapi.json', () => {
  it('returns 200 with a valid OpenAPI document', async () => {
    const res = await request(app).get('/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths).toBeDefined();
  });
});

describe('GET /unknown-route', () => {
  it('returns 404 with error shape', async () => {
    const res = await request(app).get('/totally-unknown-path');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

describe('GET /me/ping (protected route)', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/me/ping');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });
});
