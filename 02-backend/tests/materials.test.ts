/**
 * Materials catalog read paths — paginated list, search, and detail by slug.
 * Mirrors the library tests; tolerates an empty catalog but exercises
 * detail-by-slug when materials exist.
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

describe('Materials catalog (/materials)', () => {
  it('lists materials with a cursor field', async () => {
    const res = await request(app).get('/materials?limit=5').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('nextCursor');
  });

  it('searches materials', async () => {
    const res = await request(app).get('/materials/search?q=wood').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('fetches a single material by slug when seeded', async () => {
    const list = await request(app).get('/materials?limit=1').set(...authHeader(user.token));
    if (list.body.data.length === 0) return; // empty catalog — nothing to detail.
    const slug = list.body.data[0].id; // identity is the catalog slug (Decision A).
    const res = await request(app).get(`/materials/${slug}`).set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(slug);
  });

  it('rejects unauthenticated access with 401', async () => {
    const res = await request(app).get('/materials');
    expect(res.status).toBe(401);
  });
});
