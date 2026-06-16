-- Migration 012: Operation log (future CRDT/OT scaffold)
-- Append-only partitioned table for recording all project operations.
-- Depends on: 003_projects.sql, 002_profiles.sql
--
-- TODO: Add a new monthly partition before 2027-01-01 when the current
-- partition (project_operations_2025_2026) approaches its upper bound.
-- Current date: 2026-05-20 — partition is active.

CREATE TABLE public.project_operations (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES public.profiles(id),
  op_type       TEXT NOT NULL,
  op_data       JSONB NOT NULL,
  vector_clock  JSONB,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
PARTITION BY RANGE (applied_at);

-- Initial partition covering 2025-01-01 to 2027-01-01.
CREATE TABLE public.project_operations_2025_2026
  PARTITION OF public.project_operations
  FOR VALUES FROM ('2025-01-01') TO ('2027-01-01');
