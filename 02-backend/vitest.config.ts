import { defineConfig } from 'vitest/config';

// DB-touching integration tests hit the remote Supabase pooler, so each request
// carries network latency. Raise the per-test and per-hook timeouts well above
// Vitest's 5s default to accommodate multi-request flows (e.g. 6× autosave).
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
