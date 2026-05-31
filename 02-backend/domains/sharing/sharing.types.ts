export type SharePermission = 'viewer' | 'commenter' | 'editor';

export interface Share {
  id: string;
  projectId: string;
  sharedWith: string | null;
  permission: SharePermission;
  token: string | null;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}
