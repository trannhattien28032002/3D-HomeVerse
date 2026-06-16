import crypto from 'crypto';
import { pool } from '../../shared/db/client';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import * as projectsRepo from '../projects/projects.repository';
import * as repo from './sharing.repository';
import type { Share, SharePermission } from './sharing.types';
import type { CreateShareInput, UpdateShareInput } from './sharing.schema';

export async function createShare(
  userId: string,
  projectId: string,
  input: CreateShareInput
): Promise<Share> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can manage shares');

  // If no sharedWith, generate a link share token (32 hex chars).
  const token = !input.sharedWith
    ? crypto.randomBytes(16).toString('hex')
    : undefined;

  return repo.createShare(pool, {
    projectId,
    createdBy: userId,
    sharedWith: input.sharedWith,
    permission: input.permission,
    expiresAt: input.expiresAt,
    token,
  });
}

export async function listShares(
  userId: string,
  projectId: string
): Promise<Share[]> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can view shares');

  return repo.listForProject(pool, projectId);
}

export async function updateShare(
  userId: string,
  projectId: string,
  shareId: string,
  input: UpdateShareInput
): Promise<Share> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can update shares');

  const share = await repo.findById(pool, shareId);
  if (!share || share.projectId !== projectId) throw new NotFoundError('Share not found');

  return repo.updateShare(pool, shareId, {
    permission: input.permission as SharePermission | undefined,
    expiresAt: input.expiresAt,
  });
}

export async function revokeShare(
  userId: string,
  projectId: string,
  shareId: string
): Promise<void> {
  const project = await projectsRepo.findById(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can revoke shares');

  const share = await repo.findById(pool, shareId);
  if (!share || share.projectId !== projectId) throw new NotFoundError('Share not found');

  await repo.deleteShare(pool, shareId);
}

// Resolves a share token and returns the share if valid and not expired.
// Used by the public GET /share/:token endpoint.
export async function resolveShareToken(
  token: string
): Promise<{ share: Share; projectId: string }> {
  const share = await repo.findByToken(pool, token);
  if (!share) throw new ForbiddenError('Invalid or expired share token');

  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    throw new ForbiddenError('Share token has expired');
  }

  return { share, projectId: share.projectId };
}
