/**
 * Critical test #5 — share token expiry (adapted to the actual wiring).
 *
 * NOTE: the scene routes use `requireAuth` only and never mount
 * `attachShareContext`, so the plan's "GET /projects/:id/scene?shareToken=…"
 * read path is NOT wired (req.shareContext is always undefined there). The
 * token-expiry logic that IS wired lives in `resolveShareToken`, exercised via
 * the public `GET /share/:token`. These tests cover that real path.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { createTestUser, deleteTestUser, authHeader, type TestUser } from './helpers/fixtures';

let app: Express;
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  app = createApp();
  user = await createTestUser();
  const res = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'Shared' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Share token resolve + expiry (critical #5)', () => {
  it('creates a link share and resolves a valid token', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/share`)
      .set(...authHeader(user.token))
      .send({ permission: 'viewer' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();

    const resolve = await request(app).get(`/share/${res.body.token}`);
    expect(resolve.status).toBe(200);
    expect(resolve.body.permission).toBe('viewer');
    expect(resolve.body.projectMeta.id).toBe(projectId);
  });

  it('rejects an already-expired share token (403)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app)
      .post(`/projects/${projectId}/share`)
      .set(...authHeader(user.token))
      .send({ permission: 'viewer', expiresAt: past });
    expect(res.status).toBe(201);

    const resolve = await request(app).get(`/share/${res.body.token}`);
    expect(resolve.status).toBe(403);
    expect(resolve.body.error.code).toBe('FORBIDDEN');
  });

  it('only the owner can create a share (403)', async () => {
    const other = await createTestUser();
    try {
      const res = await request(app)
        .post(`/projects/${projectId}/share`)
        .set(...authHeader(other.token))
        .send({ permission: 'viewer' });
      expect(res.status).toBe(403);
    } finally {
      await deleteTestUser(other.userId);
    }
  });
});
