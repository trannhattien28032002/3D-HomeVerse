/**
 * Critical test #3 — autosave prune keep-last-5. Six consecutive POSTs must
 * leave exactly 5 rows; latest returns the most recent blob.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { pool } from '../shared/db/client';
import { createTestUser, deleteTestUser, makeScene, authHeader, type TestUser } from './helpers/fixtures';

let app: Express;
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  app = createApp();
  user = await createTestUser();
  const res = await request(app).post('/projects').set(...authHeader(user.token)).send({ name: 'Autosave' });
  projectId = res.body.id;
});

afterAll(async () => {
  await deleteTestUser(user.userId);
});

describe('Autosave prune keep-last-5 (critical #3)', () => {
  it('keeps exactly 5 rows after 6 inserts', async () => {
    for (let seq = 1; seq <= 6; seq++) {
      const res = await request(app)
        .post(`/projects/${projectId}/autosave`)
        .set(...authHeader(user.token))
        .send({ sceneData: makeScene({ seq }), clientId: 'test-client' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    }

    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.project_autosaves WHERE project_id = $1',
      [projectId]
    );
    expect(rows[0].n).toBe(5);
  });

  it('returns the most recent autosave from /latest', async () => {
    const res = await request(app).get(`/projects/${projectId}/autosave/latest`).set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(res.body.sceneData.seq).toBe(6);
  });
});
