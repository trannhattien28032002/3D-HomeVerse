/**
 * Critical test #4 — version create + restore. version_num auto-increments;
 * list is newest-first; restore copies the snapshot's scene_data back.
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
  const res = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'Versions' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Versions create + restore (critical #4)', () => {
  it('auto-increments version_num and restores scene_data', async () => {
    const sceneV1 = makeScene({ state: 'v1' });
    await request(app).put(`/projects/${projectId}/scene`).set(...authHeader(user.token)).send({ sceneData: sceneV1 });

    const v1 = await request(app).post(`/projects/${projectId}/versions`).set(...authHeader(user.token)).send({ label: 'first' });
    expect(v1.status).toBe(201);
    expect(v1.body.versionNum).toBe(1);

    // Mutate the scene, then snapshot again.
    await request(app).put(`/projects/${projectId}/scene`).set(...authHeader(user.token)).send({ sceneData: makeScene({ state: 'v2' }) });
    const v2 = await request(app).post(`/projects/${projectId}/versions`).set(...authHeader(user.token)).send({ label: 'second' });
    expect(v2.body.versionNum).toBe(2);

    // List is newest-first.
    const list = await request(app).get(`/projects/${projectId}/versions`).set(...authHeader(user.token));
    expect(list.status).toBe(200);
    expect(list.body.data[0].versionNum).toBe(2);
    expect(list.body.data).toHaveLength(2);

    // Restore v1 → scene reverts to the v1 snapshot.
    const restore = await request(app).post(`/projects/${projectId}/versions/${v1.body.id}/restore`).set(...authHeader(user.token));
    expect(restore.status).toBe(200);
    expect(typeof restore.body.restoredAt).toBe('string');

    const scene = await request(app).get(`/projects/${projectId}/scene`).set(...authHeader(user.token));
    expect(scene.body.sceneData).toEqual(sceneV1);
  });
});
