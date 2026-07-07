/**
 * Covers `assertProjectAccess` (the shared ownership-gate helper in
 * projects.service.ts) via the real HTTP API — owner success, non-owner
 * 403, nonexistent-id 404, and soft-deleted-project 404 (findById excludes
 * soft-deleted rows, unlike restoreProject's findByIdIncludingDeleted).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../app';
import { createTestUser, deleteTestUser, authHeader, type TestUser } from './helpers/fixtures';

let app: Express;
let owner: TestUser;
let projectId: string;

beforeAll(async () => {
  app = createApp();
  owner = await createTestUser();
  const res = await request(app)
    .post('/projects')
    .set(...authHeader(owner.token))
    .send({ name: 'Access Test' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(owner.userId);
});

describe('assertProjectAccess (via GET /projects/:id)', () => {
  it('lets the owner access their own project', async () => {
    const res = await request(app).get(`/projects/${projectId}`).set(...authHeader(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
  });

  it('returns 403 FORBIDDEN for a non-owner', async () => {
    const other = await createTestUser();
    try {
      const res = await request(app).get(`/projects/${projectId}`).set(...authHeader(other.token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      await deleteTestUser(other.userId);
    }
  });

  it('returns 404 NOT_FOUND for a nonexistent project id', async () => {
    const res = await request(app)
      .get(`/projects/${randomUUID()}`)
      .set(...authHeader(owner.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a soft-deleted project, even to its owner', async () => {
    const created = await request(app)
      .post('/projects')
      .set(...authHeader(owner.token))
      .send({ name: 'to-delete' });
    const id = created.body.id;

    expect((await request(app).delete(`/projects/${id}`).set(...authHeader(owner.token))).status).toBe(204);

    const res = await request(app).get(`/projects/${id}`).set(...authHeader(owner.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
