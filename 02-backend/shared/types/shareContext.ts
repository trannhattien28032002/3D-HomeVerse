// Shared type representing a resolved share token context.
// Attached to req.shareContext by the attachShareContext middleware (Phase 9).
export interface ShareContext {
  projectId: string;
  permission: 'viewer' | 'commenter' | 'editor';
}
