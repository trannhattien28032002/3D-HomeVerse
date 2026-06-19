/**
 * Library catalog read paths — categories, paginated list, search, and detail
 * by slug. Runs against the seeded dev catalog; assertions tolerate an empty
 * catalog (shape-only) but exercise detail-by-slug when objects exist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { createTestUser, deleteTestUser, authHeader, type TestUser } from './helpers/fixtures';

let app: Express;
let user: TestUser;

beforeAll(async () => {
  app = createApp();
  user = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Library catalog (/library)', () => {
  it('returns category slugs', async () => {
    const res = await request(app).get('/library/categories').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('lists objects with a cursor field', async () => {
    const res = await request(app).get('/library/objects?limit=5').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('nextCursor');
  });

  it('searches objects', async () => {
    const res = await request(app).get('/library/objects/search?q=chair').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('fetches a single object by slug when the catalog is seeded', async () => {
    const list = await request(app).get('/library/objects?limit=1').set(...authHeader(user.token));
    if (list.body.data.length === 0) return; // empty catalog — nothing to detail.
    const slug = list.body.data[0].id; // identity is the catalog slug (Decision A).
    const res = await request(app).get(`/library/objects/${slug}`).set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(slug);
  });

  it('rejects unauthenticated access with 401', async () => {
    const res = await request(app).get('/library/categories');
    expect(res.status).toBe(401);
  });
});
