/**
 * Critical test #1 — scene save/load round-trip (the most important test).
 * Asserts the scene_data blob deep-equals across PUT→GET and that slug
 * references (Decision A) are returned byte-identical / unmutated.
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
  const res = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'Scene RT' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Scene save/load round-trip (critical #1)', () => {
  it('round-trips the scene_data blob and preserves slug references', async () => {
    const scene = makeScene({
      furniture: [
        { id: 'f1', modelId: 'bath-01', x: 1.5, y: 0, z: -2, materials: { body: 'Asphalt031' } },
      ],
      wallItems: [{ id: 'wi1', modelId: 'window-01', wallId: 'w1' }],
      floors: { 'room-1': { material: 'Tiles074' } },
      materialFaces: { 'w1:left': 'Paint001' },
    });

    const put = await request(app)
      .put(`/projects/${projectId}/scene`)
      .set(...authHeader(user.token))
      .send({ sceneData: scene });
    expect(put.status).toBe(200);
    expect(typeof put.body.savedAt).toBe('string');

    const get = await request(app).get(`/projects/${projectId}/scene`).set(...authHeader(user.token));
    expect(get.status).toBe(200);
    expect(get.body.sceneData).toEqual(scene);
    // Slugs must be byte-identical (the API never rewrites them).
    expect(get.body.sceneData.furniture[0].modelId).toBe('bath-01');
    expect(get.body.sceneData.furniture[0].materials.body).toBe('Asphalt031');
  });

  it('rejects scene_data without a numeric version (422)', async () => {
    const res = await request(app)
      .put(`/projects/${projectId}/scene`)
      .set(...authHeader(user.token))
      .send({ sceneData: { furniture: [] } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects access without a token (401)', async () => {
    const res = await request(app).get(`/projects/${projectId}/scene`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
