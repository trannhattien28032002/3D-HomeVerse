/**
 * Integration tests for POST /auth/register.
 *
 * These tests cover input validation only — they do NOT call the real Supabase
 * Admin API (that would require a live local Supabase instance and is handled
 * by end-to-end tests). All Supabase calls are intercepted at the service level
 * by the mock below, keeping the suite fast and deterministic.
 *
 * Pattern: same as health.test.ts — createApp() + supertest, no live port.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';

// ── Mock the auth service so no real Supabase calls are made ─────────────────
// We spy at the module level, replacing registerUser for each test case.
vi.mock('../domains/auth/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domains/auth/auth.service')>();
  return {
    ...actual,
    registerUser: vi.fn(),
  };
});

import * as authService from '../domains/auth/auth.service';

let app: Express;

beforeAll(() => {
  app = createApp();
});

// ── Validation tests (no Supabase calls needed) ───────────────────────────────

describe('POST /auth/register — input validation', () => {
  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'Sup3r$ecret' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'Sup3r$ecret' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Ab1$' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password without uppercase letter', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'sup3r$ecret' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password without digit', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Sup$ecret' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password without special character', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Sup3recret' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown extra fields (strict schema)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Sup3r$ecret', role: 'admin' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── Service-layer happy-path and error propagation tests ──────────────────────

describe('POST /auth/register — service integration', () => {
  it('returns 201 with id, email, displayName on success', async () => {
    vi.mocked(authService.registerUser).mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user@example.com',
      displayName: 'Test User',
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Sup3r$ecret', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user@example.com',
      displayName: 'Test User',
    });
  });

  it('returns 201 with null displayName when not provided', async () => {
    vi.mocked(authService.registerUser).mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000002',
      email: 'noname@example.com',
      displayName: null,
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'noname@example.com', password: 'Sup3r$ecret' });

    expect(res.status).toBe(201);
    expect(res.body.displayName).toBeNull();
  });

  it('propagates 409 ConflictError from service', async () => {
    const { ConflictError } = await import('../shared/errors/ConflictError');
    vi.mocked(authService.registerUser).mockRejectedValueOnce(
      new ConflictError('An account with this email address already exists')
    );

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'duplicate@example.com', password: 'Sup3r$ecret' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('propagates 502 AppError from service on Supabase failure', async () => {
    const { AppError } = await import('../shared/errors/AppError');
    vi.mocked(authService.registerUser).mockRejectedValueOnce(
      new AppError('Registration failed: upstream error', 502, 'UPSTREAM_ERROR')
    );

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'Sup3r$ecret' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });
});
