/**
 * Critical test #2 — duplication copy (single-row copy incl. scene_data,
 * source left unchanged), plus soft-delete→404→restore and ownership 403s.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { createTestUser, deleteTestUser, makeScene, authHeader, type TestUser } from './helpers/fixtures';

let app: Express;
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  app = createApp();
  user = await createTestUser();
  const res = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'Source' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Project duplicate (critical #2)', () => {
  it('copies scene_data into a new project and leaves the source unchanged', async () => {
    const scene = makeScene({ furniture: [{ id: 'f1', modelId: 'sofa-01' }], tag: 'original' });
    await request(app).put(`/projects/${projectId}/scene`).set(...authHeader(user.token)).send({ sceneData: scene });

    const dup = await request(app).post(`/projects/${projectId}/duplicate`).set(...authHeader(user.token));
    expect(dup.status).toBe(201);
    expect(dup.body.id).toBeDefined();
    expect(dup.body.id).not.toBe(projectId);
    expect(dup.body.name).toContain('Copy');

    const dupScene = await request(app).get(`/projects/${dup.body.id}/scene`).set(...authHeader(user.token));
    expect(dupScene.body.sceneData).toEqual(scene);

    const srcScene = await request(app).get(`/projects/${projectId}/scene`).set(...authHeader(user.token));
    expect(srcScene.body.sceneData).toEqual(scene);
  });
});

describe('Project soft-delete + restore', () => {
  it('soft-deleted project returns 404, restore brings it back', async () => {
    const created = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'temp' });
    const id = created.body.id;

    expect((await request(app).delete(`/projects/${id}`).set(...authHeader(user.token))).status).toBe(204);
    expect((await request(app).get(`/projects/${id}`).set(...authHeader(user.token))).status).toBe(404);
    expect((await request(app).post(`/projects/${id}/restore`).set(...authHeader(user.token))).status).toBe(200);
    expect((await request(app).get(`/projects/${id}`).set(...authHeader(user.token))).status).toBe(200);
  });

  it('a non-owner cannot delete the project (403)', async () => {
    const other = await createTestUser();
    try {
      const res = await request(app).delete(`/projects/${projectId}`).set(...authHeader(other.token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      await deleteTestUser(other.userId);
    }
  });
});
