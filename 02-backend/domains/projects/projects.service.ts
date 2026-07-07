import { pool } from '../../shared/db/client';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { AppError } from '../../shared/errors/AppError';
import * as repo from './projects.repository';
import type { ProjectMeta, CreateProjectInput, UpdateProjectMetaInput } from './projects.types';

export async function listProjects(
  userId: string,
  query: { cursor?: string; limit: number; sort: 'updatedAt' | 'createdAt' | 'name' }
): Promise<{ data: ProjectMeta[]; nextCursor: string | null }> {
  let cursor: ReturnType<typeof repo.decodeCursor> = null;
  if (query.cursor) {
    cursor = repo.decodeCursor(query.cursor);
    if (!cursor) {
      throw new AppError('Invalid cursor', 400, 'BAD_REQUEST');
    }
  }

  const rows = await repo.listByOwner(pool, userId, cursor, query.limit, query.sort);
  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = data[data.length - 1];
    const cursorVal = query.sort === 'name' ? last.name : (last.updatedAt ?? last.createdAt);
    nextCursor = repo.encodeCursor(cursorVal as Date | string, last.id);
  }

  return { data, nextCursor };
}

export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<ProjectMeta> {
  return repo.create(pool, userId, input);
}

export async function assertProjectAccess(
  userId: string,
  projectId: string,
  messages?: { notFound?: string; forbidden?: string }
): Promise<ProjectMeta> {
  const project = await repo.findById(pool, projectId);
  if (!project) throw new NotFoundError(messages?.notFound ?? 'Project not found');
  if (project.ownerId !== userId) {
    throw new ForbiddenError(messages?.forbidden ?? 'You do not have access to this project');
  }
  return project;
}

export async function getProjectMetaById(projectId: string): Promise<ProjectMeta | null> {
  return repo.findById(pool, projectId);
}

export function getProject(userId: string, projectId: string): Promise<ProjectMeta> {
  return assertProjectAccess(userId, projectId);
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectMetaInput
): Promise<ProjectMeta> {
  await assertProjectAccess(userId, projectId, {
    forbidden: 'Only the owner can update this project',
  });

  return repo.updateMeta(pool, projectId, input);
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await assertProjectAccess(userId, projectId, {
    forbidden: 'Only the owner can delete this project',
  });

  await repo.softDelete(pool, projectId);
}

export async function restoreProject(
  userId: string,
  projectId: string
): Promise<ProjectMeta> {
  const project = await repo.findByIdIncludingDeleted(pool, projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can restore this project');

  return repo.restore(pool, projectId);
}

export async function duplicateProject(
  userId: string,
  sourceId: string
): Promise<{ id: string; name: string }> {
  // Verify source project is accessible to this user.
  const source = await assertProjectAccess(userId, sourceId, {
    notFound: 'Source project not found',
    forbidden: 'Only the owner can duplicate this project',
  });

  // Per Decision B, duplicate is a single-row copy that includes scene_data.
  // No project_objects copy leg, so no transaction is required.
  return repo.duplicateProjectRow(pool, sourceId, userId);
}
