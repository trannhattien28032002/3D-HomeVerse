/**
 * Auth profile — GET /auth/me returns the token user's profile; PATCH
 * /auth/me/profile updates display_name; both reject unauthenticated calls.
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

describe('Auth profile (/auth/me)', () => {
  it('returns the authenticated user profile', async () => {
    const res = await request(app).get('/auth/me').set(...authHeader(user.token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.userId);
    expect(res.body.email).toBe(`${user.userId}@test.local`);
    expect(typeof res.body.plan).toBe('string');
  });

  it('updates display_name via PATCH /auth/me/profile', async () => {
    const res = await request(app)
      .patch('/auth/me/profile')
      .set(...authHeader(user.token))
      .send({ displayName: 'Renamed Dweller' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Renamed Dweller');

    // Persisted: a fresh GET reflects the change.
    const me = await request(app).get('/auth/me').set(...authHeader(user.token));
    expect(me.body.displayName).toBe('Renamed Dweller');
  });

  it('rejects unauthenticated access with 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
});
