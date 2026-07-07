import { pool } from '../../shared/db/client';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsService from '../projects/projects.service';
import * as repo from './versions.repository';
import type { Version, VersionSummary } from './version.types';

export async function createVersion(
  userId: string,
  projectId: string,
  label?: string
): Promise<VersionSummary> {
  await projectsService.assertProjectAccess(userId, projectId, {
    forbidden: 'Only the owner can create versions',
  });

  return repo.createVersion(pool, projectId, label, userId);
}

export async function listVersions(
  userId: string,
  projectId: string
): Promise<VersionSummary[]> {
  await projectsService.assertProjectAccess(userId, projectId);

  return repo.listVersions(pool, projectId);
}

export async function getVersion(
  userId: string,
  projectId: string,
  versionId: string
): Promise<Version> {
  await projectsService.assertProjectAccess(userId, projectId);

  const version = await repo.getVersion(pool, versionId);
  if (!version || version.projectId !== projectId) throw new NotFoundError('Version not found');
  return version;
}

export async function restoreVersion(
  userId: string,
  projectId: string,
  versionId: string
): Promise<{ restoredAt: string }> {
  await projectsService.assertProjectAccess(userId, projectId, {
    forbidden: 'Only the owner can restore versions',
  });

  // Verify the version belongs to this project.
  const version = await repo.getVersion(pool, versionId);
  if (!version || version.projectId !== projectId) throw new NotFoundError('Version not found');

  // Single-row UPDATE copying scene_data back (Decision B) — no transaction needed.
  await repo.restoreVersion(pool, projectId, versionId);

  return { restoredAt: new Date().toISOString() };
}
