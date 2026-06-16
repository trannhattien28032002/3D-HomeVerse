import { pool } from '../../shared/db/client';
import { withTransaction } from '../../shared/db/transaction';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsRepo from '../projects/projects.repository';
import * as repo from './versions.repository';
import type { Version, VersionSummary } from './version.types';
import type { ShareContext } from '../../shared/types/shareContext';

export async function createVersion(
  userId: string,
  projectId: string,
  label?: string
): Promise<VersionSummary> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can create versions');

  return repo.createVersion(pool, projectId, label, userId);
}

export async function listVersions(
  userId: string,
  projectId: string,
  shareContext?: ShareContext
): Promise<VersionSummary[]> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  return repo.listVersions(pool, projectId);
}

export async function getVersion(
  userId: string,
  projectId: string,
  versionId: string,
  shareContext?: ShareContext
): Promise<Version> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');

  if (project.ownerId !== userId) {
    if (!shareContext || shareContext.projectId !== projectId) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  const version = await repo.getVersion(pool, versionId);
  if (!version || version.projectId !== projectId) throw new NotFoundError('Version not found');
  return version;
}

export async function restoreVersion(
  userId: string,
  projectId: string,
  versionId: string
): Promise<{ restoredAt: string }> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can restore versions');

  // Verify the version belongs to this project before starting transaction.
  const version = await repo.getVersion(pool, versionId);
  if (!version || version.projectId !== projectId) throw new NotFoundError('Version not found');

  await withTransaction(pool, async (client) => {
    await repo.restoreVersion(client, projectId, versionId);
  });

  return { restoredAt: new Date().toISOString() };
}
